"""
Transform ArUco marker positions to fingertip positions
Based on the visual servoing demo code
"""

import numpy as np
import pathlib
import os


# Constants for different suction cup heights
suctioncup_height = {
    'cup_top': 0.014,
    'cup_bottom': 0.007,
    'cylinder_top': 0.004,
    'cylinder_bottom': 0.0
}


class ArucoToFingertips:
    """Transform ArUco marker positions to fingertip positions"""
    
    def __init__(self, urdf_filename=None, default_height_above_mounting_surface=None):
        self.default_height_above_mounting_surface = default_height_above_mounting_surface
        
        # Simplified transform based on typical Stretch gripper geometry
        # These are approximate offsets from ArUco marker to fingertip
        self.translations = {
            'left': np.array([-0.007, 0.0, 0.0]),   # 7mm to the left
            'right': np.array([0.007, 0.0, 0.0])    # 7mm to the right
        }
        
        # Rotation is identity for typical gripper setup
        self.rotations = {
            'left': np.eye(3),
            'right': np.eye(3)
        }
        
        self.marker_left_name = 'finger_left'
        self.marker_right_name = 'finger_right'
        self.marker_names = [self.marker_left_name, self.marker_right_name]
        
        self.sides = ['left', 'right']
    
    def get_fingertips(self, markers):
        """
        Find the fingertip poses using finger ArUco markers observed from a gripper camera.
        
        Args:
            markers: Dictionary of detected marker data
            
        Returns:
            Dictionary with 'left' and 'right' fingertip poses
        """
        fingertips = {}
        
        for marker_name in markers.keys():
            m = markers[marker_name]
            name = m['info']['name']
            
            if name in self.marker_names:
                marker_pos = m['pos']
                marker_x_axis = m['x_axis']
                marker_y_axis = m['y_axis']
                marker_z_axis = m['z_axis']
                
                # Determine side
                if 'left' in name:
                    side = 'left'
                else:
                    side = 'right'
                
                # Build coordinate frame from marker axes
                A = np.zeros((3, 3))
                A[:, 0] = marker_x_axis.flatten()
                A[:, 1] = marker_y_axis.flatten()
                A[:, 2] = marker_z_axis.flatten()
                
                # Get translation and rotation transforms
                t = self.translations[side]
                T = self.rotations[side]
                
                # Transform to fingertip frame
                F = np.matmul(A, T)
                
                fingertip_x_axis = F[:, 0].flatten()
                fingertip_y_axis = F[:, 1].flatten()
                fingertip_z_axis = F[:, 2].flatten()
                
                # Calculate fingertip position
                if (self.default_height_above_mounting_surface is None):
                    fingertip_pos = marker_pos + np.matmul(A, t)
                else:
                    fingertip_pos = (marker_pos + np.matmul(A, t)) + (
                        self.default_height_above_mounting_surface * fingertip_z_axis
                    )
                
                fingertips[side] = {
                    'pos': fingertip_pos,
                    'x_axis': fingertip_x_axis,
                    'y_axis': fingertip_y_axis,
                    'z_axis': fingertip_z_axis
                }
        
        return fingertips

