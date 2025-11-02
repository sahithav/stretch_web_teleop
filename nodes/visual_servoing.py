#!/usr/bin/env python3

"""
Visual Servoing ROS2 Node - Placeholder
Will be replaced with task planning functionality
"""

import rclpy
from rclpy.node import Node
from std_srvs.srv import Trigger


class VisualServoingNode(Node):
    """ROS2 node placeholder"""
    
    def __init__(self):
        super().__init__('visual_servoing_node')
        
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
        
        self.get_logger().info('Visual Servoing node started (placeholder)')
        
    def start_visual_servoing_callback(self, request, response):
        """Service callback to start visual servoing"""
        self.get_logger().info('Received request to start visual servoing (not implemented)')
        response.success = True
        response.message = "Visual servoing started (placeholder)"
        return response
    
    def stop_visual_servoing_callback(self, request, response):
        """Service callback to stop visual servoing"""
        self.get_logger().info('Received request to stop visual servoing (not implemented)')
        response.success = True
        response.message = "Visual servoing stopped"
        return response


def main(args=None):
    rclpy.init(args=args)
    node = VisualServoingNode()
    
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
