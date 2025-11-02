#!/usr/bin/env python3

"""
Visual Servoing ROS2 Node
Provides a service to start/stop visual servoing using the Hello Robot visual servoing code
"""

import rclpy
from rclpy.node import Node
from std_srvs.srv import Trigger
import subprocess
import threading
import os
import signal
import sys


class VisualServoingNode(Node):
    """ROS2 node that provides services to start and stop visual servoing"""
    
    def __init__(self):
        super().__init__('visual_servoing_node')
        
        # Declare parameters for visual servoing configuration
        self.declare_parameter('visual_servoing_repo_path', '~/stretch_visual_servoing')
        self.declare_parameter('use_yolo', False)
        self.declare_parameter('use_remote_computer', False)
        self.declare_parameter('exposure', 'low')
        
        # Get parameter values
        self.repo_path = os.path.expanduser(
            self.get_parameter('visual_servoing_repo_path').get_parameter_value().string_value
        )
        self.use_yolo = self.get_parameter('use_yolo').get_parameter_value().bool_value
        self.use_remote_computer = self.get_parameter('use_remote_computer').get_parameter_value().bool_value
        self.exposure = self.get_parameter('exposure').get_parameter_value().string_value
        
        # Create services
        self.start_service = self.create_service(
            Trigger,
            'start_visual_servoing',
            self.start_visual_servoing_callback
        )
        
        self.stop_service = self.create_service(
            Trigger,
            'stop_visual_servoing',
            self.stop_visual_servoing_callback
        )
        
        self.visual_servoing_process = None
        self.get_logger().info('Visual Servoing node started')
        self.get_logger().info(f'Config: repo_path={self.repo_path}, use_yolo={self.use_yolo}, use_remote={self.use_remote_computer}, exposure={self.exposure}')
        
    def start_visual_servoing_callback(self, request, response):
        """Service callback to start visual servoing"""
        self.get_logger().info('Received request to start visual servoing')
        
        if self.visual_servoing_process is not None:
            self.get_logger().warn('Visual servoing already running')
            response.success = False
            response.message = "Visual servoing already running"
            return response
        
        try:
            # Launch visual servoing in a subprocess
            # Use the configured repository path
            script_path = os.path.join(
                self.repo_path,
                'visual_servoing_demo.py'
            )
            
            # Check if the script exists
            if not os.path.isfile(script_path):
                self.get_logger().error(f'Visual servoing script not found at {script_path}')
                response.success = False
                response.message = f"Visual servoing script not found at {script_path}"
                return response
            
            # Build command arguments based on parameters
            cmd = ['python3', script_path]
            
            # Add flags based on configuration
            if self.use_yolo:
                cmd.append('-y')
            if self.use_remote_computer:
                cmd.append('-r')
            
            # Add exposure setting
            if self.exposure:
                cmd.extend(['-e', self.exposure])
            
            self.get_logger().info(f'Starting visual servoing with command: {" ".join(cmd)}')
            self.get_logger().info(f'Working directory: {self.repo_path}')
            
            # Start the process in the visual servoing repo directory
            # This ensures it can find aruco_marker_info.yaml
            self.visual_servoing_process = subprocess.Popen(
                cmd,
                cwd=self.repo_path,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            
            self.get_logger().info(f'Started visual servoing with PID {self.visual_servoing_process.pid}')
            response.success = True
            response.message = f"Visual servoing started with PID {self.visual_servoing_process.pid}"
            
        except Exception as e:
            self.get_logger().error(f'Error starting visual servoing: {e}')
            response.success = False
            response.message = f"Error: {str(e)}"
            
        return response
    
    def stop_visual_servoing_callback(self, request, response):
        """Service callback to stop visual servoing"""
        self.get_logger().info('Received request to stop visual servoing')
        
        if self.visual_servoing_process is None:
            self.get_logger().warn('No visual servoing process running')
            response.success = False
            response.message = "No visual servoing process running"
            return response
        
        try:
            # Terminate the process
            self.visual_servoing_process.terminate()
            
            # Wait for it to terminate (with timeout)
            try:
                self.visual_servoing_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                # Force kill if it doesn't terminate gracefully
                self.get_logger().warn('Process did not terminate gracefully, force killing')
                self.visual_servoing_process.kill()
                self.visual_servoing_process.wait()
            
            self.get_logger().info('Visual servoing stopped')
            self.visual_servoing_process = None
            response.success = True
            response.message = "Visual servoing stopped"
            
        except Exception as e:
            self.get_logger().error(f'Error stopping visual servoing: {e}')
            response.success = False
            response.message = f"Error: {str(e)}"
            
        return response


def main(args=None):
    rclpy.init(args=args)
    node = VisualServoingNode()
    
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        # Stop visual servoing if it's running
        if node.visual_servoing_process is not None:
            node.get_logger().info('Shutting down - stopping visual servoing')
            node.visual_servoing_process.terminate()
            try:
                node.visual_servoing_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                node.visual_servoing_process.kill()
        
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()

