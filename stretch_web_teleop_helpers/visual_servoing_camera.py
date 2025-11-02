"""
Camera helpers for visual servoing using ROS2 camera topics
"""

import numpy as np
import cv2


def pixel_from_3d(xyz, camera_info):
    """Convert 3D point to pixel coordinates"""
    x_in, y_in, z_in = xyz
    camera_matrix = camera_info['camera_matrix']
    f_x = camera_matrix[0,0]
    c_x = camera_matrix[0,2]
    f_y = camera_matrix[1,1]
    c_y = camera_matrix[1,2]
    x_pix = ((f_x * x_in) / z_in) + c_x
    y_pix = ((f_y * y_in) / z_in) + c_y
    xy = np.array([x_pix, y_pix])
    return xy


def pixel_to_3d(xy_pix, z_in, camera_info):
    """Convert pixel coordinates to 3D point"""
    x_pix, y_pix = xy_pix
    camera_matrix = camera_info['camera_matrix']
    f_x = camera_matrix[0,0]
    c_x = camera_matrix[0,2]
    f_y = camera_matrix[1,1]
    c_y = camera_matrix[1,2]
    x_out = ((x_pix - c_x) * z_in) / f_x
    y_out = ((y_pix - c_y) * z_in) / f_y
    xyz_out = np.array([x_out, y_out, z_in])
    return xyz_out


def camera_info_to_dict(camera_info_msg):
    """Convert ROS2 CameraInfo message to dict"""
    camera_matrix = np.array(camera_info_msg.k).reshape(3, 3)
    distortion_coefficients = np.array(camera_info_msg.d)
    
    return {
        'camera_matrix': camera_matrix,
        'distortion_coefficients': distortion_coefficients,
        'distortion_model': camera_info_msg.distortion_model
    }

