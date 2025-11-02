#!/usr/bin/env python3

"""
Visual Servoing ROS2 Node
Implements visual servoing to detect ArUco markers and grasp objects
"""

import os
import sys
import threading
import time
from pathlib import Path

import cv2
import numpy as np
import rclpy
import tf2_ros
import yaml
from ament_index_python import get_package_share_directory
from cv_bridge import CvBridge
from geometry_msgs.msg import Twist
from rclpy.callback_groups import MutuallyExclusiveCallbackGroup, ReentrantCallbackGroup
from rclpy.duration import Duration
from rclpy.executors import MultiThreadedExecutor
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy
from sensor_msgs.msg import CameraInfo, Image, JointState
from std_srvs.srv import Trigger

import stretch_body.robot as rb

from stretch_web_teleop_helpers.visual_servoing_aruco import ArucoDetector
from stretch_web_teleop_helpers.visual_servoing_camera import camera_info_to_dict
from stretch_web_teleop_helpers.aruco_to_fingertips import ArucoToFingertips
import stretch_web_teleop_helpers.aruco_to_fingertips as af


class VisualServoingNode(Node):
    """ROS2 node that provides services to start and stop visual servoing"""
    
    def __init__(self):
        super().__init__('visual_servoing_node')
        
        try:
            self.get_logger().info('Initializing visual servoing node')
            
            # Get package path to find config files using ROS2 standard method
            package_share = get_package_share_directory("stretch_web_teleop")
            aruco_config_path = Path(package_share) / 'config' / 'aruco_marker_info.yaml'
            
            self.get_logger().info(f'Package share directory: {package_share}')
            self.get_logger().info(f'ArUco config path: {aruco_config_path}')
            
            if not aruco_config_path.exists():
                self.get_logger().error(f'ArUco config file not found at {aruco_config_path}')
                raise FileNotFoundError(f'ArUco config not found at {aruco_config_path}')
            
            with open(aruco_config_path) as f:
                self.marker_info = yaml.load(f, Loader=yaml.SafeLoader)
            
            self.get_logger().info(f'Loaded ArUco marker info with {len(self.marker_info)} markers')
            
            # Initialize ArUco detector
            self.aruco_detector = ArucoDetector(
                marker_info=self.marker_info,
                show_debug_images=False,
                use_apriltag_refinement=False,
                brighten_images=True
            )
            
            # Initialize fingertip transform
            self.aruco_to_fingertips = ArucoToFingertips(
                default_height_above_mounting_surface=af.suctioncup_height['cup_bottom']
            )
            
        except Exception as e:
            self.get_logger().error(f'Error during initialization: {e}')
            import traceback
            self.get_logger().error(traceback.format_exc())
            raise
        
        # ROS components
        self.cv_bridge = CvBridge()
        self.tf_buffer = tf2_ros.Buffer(cache_time=Duration(seconds=10))
        self.tf_listener = tf2_ros.TransformListener(self.tf_buffer, self)
        
        # State
        self.is_running = False
        self.run_lock = threading.Lock()
        
        # Latest camera data (thread-safe)
        self.latest_rgb_image = None
        self.latest_depth_image = None
        self.latest_camera_info = None
        self.latest_image_lock = threading.Lock()
        
        # Create callback groups
        self.image_callback_group = MutuallyExclusiveCallbackGroup()
        self.service_callback_group = ReentrantCallbackGroup()
        
        # Create subscriptions
        self.create_subscription(
            Image,
            '/gripper_camera/color/image_rect_raw',
            self.gripper_rgb_callback,
            QoSProfile(depth=1, reliability=ReliabilityPolicy.BEST_EFFORT),
            callback_group=self.image_callback_group
        )
        
        self.create_subscription(
            Image,
            '/gripper_camera/aligned_depth_to_color/image_raw',
            self.gripper_depth_callback,
            QoSProfile(depth=1, reliability=ReliabilityPolicy.BEST_EFFORT),
            callback_group=self.image_callback_group
        )
        
        self.create_subscription(
            CameraInfo,
            '/gripper_camera/color/camera_info',
            self.gripper_camera_info_callback,
            QoSProfile(depth=1, reliability=ReliabilityPolicy.BEST_EFFORT),
            callback_group=self.image_callback_group
        )
        
        # Publishers for robot control
        self.cmd_vel_pub = self.create_publisher(Twist, '/stretch/cmd_vel', 1)
        
        # Create services
        self.start_service = self.create_service(
            Trigger,
            'start_visual_servoing',
            self.start_visual_servoing_callback,
            callback_group=self.service_callback_group
        )
        
        self.stop_service = self.create_service(
            Trigger,
            'stop_visual_servoing',
            self.stop_visual_servoing_callback,
            callback_group=self.service_callback_group
        )
        
        self.get_logger().info('Visual Servoing node started successfully')
        self.get_logger().info('Services created: /start_visual_servoing, /stop_visual_servoing')
        
    def gripper_rgb_callback(self, msg):
        """Callback for gripper RGB images"""
        try:
            rgb_image = self.cv_bridge.imgmsg_to_cv2(msg, 'bgr8')
            with self.latest_image_lock:
                self.latest_rgb_image = rgb_image
        except Exception as e:
            self.get_logger().error(f'Error converting RGB image: {e}')
    
    def gripper_depth_callback(self, msg):
        """Callback for gripper depth images"""
        try:
            depth_image = self.cv_bridge.imgmsg_to_cv2(msg, '16UC1')
            with self.latest_image_lock:
                self.latest_depth_image = depth_image
        except Exception as e:
            self.get_logger().error(f'Error converting depth image: {e}')
    
    def gripper_camera_info_callback(self, msg):
        """Callback for camera info"""
        try:
            camera_info = camera_info_to_dict(msg)
            with self.latest_image_lock:
                self.latest_camera_info = camera_info
        except Exception as e:
            self.get_logger().error(f'Error processing camera info: {e}')
    
    def start_visual_servoing_callback(self, request, response):
        """Service callback to start visual servoing"""
        with self.run_lock:
            if self.is_running:
                self.get_logger().warn('Visual servoing already running')
                response.success = False
                response.message = "Visual servoing already running"
                return response
            
            self.is_running = True
        
        self.get_logger().info('Starting visual servoing thread')
        
        # Start visual servoing in background thread
        self.vs_thread = threading.Thread(
            target=self.visual_servoing_loop,
            daemon=True
        )
        self.vs_thread.start()
        
        response.success = True
        response.message = "Visual servoing started"
        return response
    
    def stop_visual_servoing_callback(self, request, response):
        """Service callback to stop visual servoing"""
        with self.run_lock:
            self.is_running = False
        
        self.get_logger().info('Stopping visual servoing')
        
        response.success = True
        response.message = "Visual servoing stopped"
        return response
    
    def visual_servoing_loop(self):
        """Main visual servoing control loop"""
        try:
            # Initialize robot
            self.get_logger().info('Initializing stretch_body robot')
            robot = rb.Robot()
            robot.startup()
            
            # Initialize normalized velocity controller
            self.get_logger().info('Initializing controller')
            from stretch_web_teleop_helpers.normalized_velocity_control import NormalizedVelocityControl
            controller = NormalizedVelocityControl(robot)
            controller.reset_base_odometry()
            
            # Control parameters from the provided code
            grasp_if_error_below = 0.02
            max_distance_for_attempted_reach = 0.5
            joint_visual_servoing_velocity_scale = {
                'base_counterclockwise': 4.0,
                'lift_up': 6.0,
                'arm_out': 6.0,
                'wrist_yaw_counterclockwise': 4.0,
                'wrist_pitch_up': 6.0,
                'wrist_roll_counterclockwise': 1.0,
            }
            gripper_open_speed = 1.0
            gripper_close_speed = 1.0
            
            first_frame = True
            toy_target = None
            between_fingertips = None
            
            self.get_logger().info('Starting visual servoing control loop')
            
            while self.is_running:
                # Get latest camera data
                with self.latest_image_lock:
                    rgb_image = self.latest_rgb_image
                    camera_info = self.latest_camera_info
                
                if rgb_image is None or camera_info is None:
                    time.sleep(0.1)
                    continue
                
                # Update ArUco detector
                self.aruco_detector.update(rgb_image, camera_info)
                markers_by_id = self.aruco_detector.get_detected_marker_dict()
                markers_by_name = self.aruco_detector.get_detected_markers()
                
                # Transform markers to fingertips
                fingertips = self.aruco_to_fingertips.get_fingertips(markers_by_name)
                
                # Find toy target
                toy_target = None
                for marker_id, marker_data in markers_by_id.items():
                    name = marker_data['info']['name']
                    if name == 'toy':
                        toy_target = marker_data['pos'] - (0.055/2.0 * marker_data['z_axis'])  # Toy depth offset
                
                # Get between fingertips from transformed data
                between_fingertips = None
                if 'left' in fingertips and 'right' in fingertips:
                    between_fingertips = (fingertips['left']['pos'] + fingertips['right']['pos']) / 2.0
                
                # Get joint state
                joint_state = controller.get_joint_state()
                
                # Compute control if we have both toy and between_fingertips
                if toy_target is not None and between_fingertips is not None:
                    position_error = toy_target - between_fingertips
                    target_error = np.linalg.norm(position_error)
                    
                    self.get_logger().info(f'Target error: {target_error*100:.2f} cm')
                    
                    # Reach behavior
                    if target_error <= max_distance_for_attempted_reach:
                        x_error, y_error, z_error = position_error
                        
                        # Transform camera frame errors to joint velocities
                        # Based on visual_servoing_demo.py line 655+
                        yaw_velocity = -x_error
                        pitch_velocity = -y_error
                        
                        # Need to transform based on wrist rotation
                        # For now, simplified transformation
                        lift_velocity = z_error  # Positive z error -> lift up
                        arm_velocity = -y_error  # Positive y error -> retract arm
                        
                        # Base rotation is more complex, skip for now
                        base_rotational_velocity = 0.0
                        
                        # Simple proportional control
                        cmd = {
                            'base_counterclockwise': base_rotational_velocity,
                            'lift_up': lift_velocity,
                            'arm_out': arm_velocity,
                            'wrist_yaw_counterclockwise': yaw_velocity,
                            'wrist_pitch_up': pitch_velocity,
                            'wrist_roll_counterclockwise': 0.0,
                        }
                        
                        # Apply velocity scales
                        cmd = {k: joint_visual_servoing_velocity_scale.get(k, 1.0) * v for k, v in cmd.items()}
                        
                        # Apply gripper control
                        if target_error < grasp_if_error_below:
                            cmd['gripper_open'] = -gripper_close_speed
                            self.get_logger().info('Grasping!')
                        else:
                            cmd['gripper_open'] = gripper_open_speed
                        
                        # Send command
                        controller.set_command(cmd)
                    else:
                        # Stop motion
                        zero_cmd = {
                            'base_counterclockwise': 0.0,
                            'lift_up': 0.0,
                            'arm_out': 0.0,
                            'wrist_yaw_counterclockwise': 0.0,
                            'wrist_pitch_up': 0.0,
                            'wrist_roll_counterclockwise': 0.0,
                            'gripper_open': gripper_open_speed,
                        }
                        controller.set_command(zero_cmd)
                else:
                    # No detection - stop
                    zero_cmd = {
                        'base_counterclockwise': 0.0,
                        'lift_up': 0.0,
                        'arm_out': 0.0,
                        'wrist_yaw_counterclockwise': 0.0,
                        'wrist_pitch_up': 0.0,
                        'wrist_roll_counterclockwise': 0.0,
                        'gripper_open': gripper_open_speed,
                    }
                    controller.set_command(zero_cmd)
                
                time.sleep(0.05)  # 20 Hz control loop
            
            # Cleanup
            self.get_logger().info('Stopping robot')
            controller.stop()
            robot.stop()
            
        except Exception as e:
            self.get_logger().error(f'Error in visual servoing loop: {e}')
            import traceback
            self.get_logger().error(traceback.format_exc())
        finally:
            with self.run_lock:
                self.is_running = False


def main(args=None):
    rclpy.init(args=args)
    node = VisualServoingNode()
    
    # Use MultiThreadedExecutor for callbacks
    executor = MultiThreadedExecutor()
    executor.add_node(node)
    
    try:
        executor.spin()
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
