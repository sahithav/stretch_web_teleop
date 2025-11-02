"""
Normalized velocity control for stretch robot
Simplified version based on the visual servoing demo code
"""

import stretch_body.robot as rb
import threading
import time


class NormalizedVelocityControl:
    """
    Controller that accepts normalized velocity commands [-1, 1] and controls the robot
    """
    
    def __init__(self, robot):
        self.robot = robot
        if not self.robot.is_homed():
            print('WARNING from NormalizedVelocityControl: Robot reporting it is not calibrated!')
        
        self.lock = threading.Lock()
        self._init_command()
        self.controller_thread = None
        self.stop_loop = False
        self._start_controller()
        
    def _init_command(self):
        with self.lock:
            self.new_command_received = False
            self.command = {'num': 0, 'time': time.time(), 'cmd': None}
    
    def stop(self):
        """Stop the controller"""
        with self.lock:
            self.stop_loop = True
            self.new_command_received = False
            self.command['num'] = self.command['num'] + 1
            self.command['time'] = time.time()
            self.command['cmd'] = self._get_zero_vel()
            self._execute(self.command)
    
    def _get_zero_vel(self):
        """Get zero velocity command"""
        zero_vel = {
            'base_forward': 0.0,
            'base_counterclockwise': 0.0,
            'lift_up': 0.0,
            'arm_out': 0.0,
            'wrist_roll_counterclockwise': 0.0,
            'wrist_pitch_up': 0.0,
            'wrist_yaw_counterclockwise': 0.0,
            'head_pan_counterclockwise': 0.0,
            'head_tilt_up': 0.0,
            'gripper_open': 0.0
        }
        return zero_vel.copy()
    
    def set_command(self, cmd):
        """Set a new command"""
        with self.lock:
            self.command['num'] = self.command['num'] + 1
            self.command['time'] = time.time()
            self.command['cmd'] = cmd.copy()
            self.new_command_received = True
    
    def reset_base_odometry(self):
        """Reset base odometry"""
        with self.lock:
            self.robot.base.reset_odometry()
    
    def get_joint_state(self):
        """Get current joint state"""
        with self.lock:
            arm_pos = self.robot.arm.status['pos']
            arm_eff = self.robot.arm.motor.status['effort_pct']
            
            lift_pos = self.robot.lift.status['pos']
            lift_eff = self.robot.lift.motor.status['effort_pct']
            
            left_wheel_pos = self.robot.base.left_wheel.status['pos']
            left_wheel_eff = self.robot.base.left_wheel.status['effort_pct']
            
            right_wheel_pos = self.robot.base.right_wheel.status['pos']
            right_wheel_eff = self.robot.base.right_wheel.status['effort_pct']
            
            wrist_roll_pos = self.robot.end_of_arm.motors['wrist_roll'].status['pos']
            wrist_roll_eff = self.robot.end_of_arm.motors['wrist_roll'].status['effort']
            
            wrist_pitch_pos = self.robot.end_of_arm.motors['wrist_pitch'].status['pos']
            wrist_pitch_eff = self.robot.end_of_arm.motors['wrist_pitch'].status['effort']
            
            wrist_yaw_pos = self.robot.end_of_arm.motors['wrist_yaw'].status['pos']
            wrist_yaw_eff = self.robot.end_of_arm.motors['wrist_yaw'].status['effort']
            
            head_pan_pos = self.robot.head.status['head_pan']['pos']
            head_pan_eff = self.robot.head.status['head_pan']['effort']
            
            head_tilt_pos = self.robot.head.status['head_tilt']['pos']
            head_tilt_eff = self.robot.head.status['head_tilt']['effort']
            
            gripper_pos = self.robot.end_of_arm.motors['stretch_gripper'].status['pos']
            gripper_pos_pct = self.robot.end_of_arm.motors['stretch_gripper'].status['pos_pct']
            gripper_eff = self.robot.end_of_arm.motors['stretch_gripper'].status['effort']
            
            base_odom_x = self.robot.base.status['x']
            base_odom_y = self.robot.base.status['y']
            base_odom_theta = self.robot.base.status['theta']
            
            state = {
                'arm_pos': arm_pos,
                'arm_eff': arm_eff,
                'lift_pos': lift_pos,
                'lift_eff': lift_eff,
                'left_wheel_pos': left_wheel_pos,
                'left_wheel_eff': left_wheel_eff,
                'right_wheel_pos': right_wheel_pos,
                'right_wheel_eff': right_wheel_eff,
                'wrist_roll_pos': wrist_roll_pos,
                'wrist_roll_eff': wrist_roll_eff,
                'wrist_pitch_pos': wrist_pitch_pos,
                'wrist_pitch_eff': wrist_pitch_eff,
                'wrist_yaw_pos': wrist_yaw_pos,
                'wrist_yaw_eff': wrist_yaw_eff,
                'head_pan_pos': head_pan_pos,
                'head_pan_eff': head_pan_eff,
                'head_tilt_pos': head_tilt_pos,
                'head_tilt_eff': head_tilt_eff,
                'gripper_pos': gripper_pos,
                'gripper_pos_pct': gripper_pos_pct,
                'gripper_eff': gripper_eff,
                'base_odom_x': base_odom_x,
                'base_odom_y': base_odom_y,
                'base_odom_theta': base_odom_theta
            }
            
            return state
    
    def controller_loop(self):
        """Controller execution loop"""
        while True:
            with self.lock:
                if self.stop_loop:
                    return
                if self.new_command_received:
                    self._execute(self.command)
                    self.new_command_received = False
            time.sleep(1.0/15.0)  # 15 Hz
    
    def _start_controller(self):
        """Start the controller thread"""
        self.controller_thread = threading.Thread(target=self.controller_loop, daemon=True)
        self.controller_thread.start()
    
    def _execute(self, norm_vel_cmd):
        """Execute a normalized velocity command"""
        cmd = norm_vel_cmd['cmd']
        if cmd is None:
            return
        
        # Mobile Base Control
        if ('base_forward' in cmd) or ('base_counterclockwise' in cmd):
            vf = 0.0
            vcc = 0.0
            if 'base_forward' in cmd:
                vf = max(-1.0, min(1.0, cmd['base_forward']))
            if 'base_counterclockwise' in cmd:
                vcc = max(-1.0, min(1.0, cmd['base_counterclockwise']))
            self.robot.base.set_velocity(vf, -vcc)
        
        # Lift Control
        if 'lift_up' in cmd:
            v = max(-1.0, min(1.0, cmd['lift_up']))
            self.robot.lift.set_velocity(v)
        
        # Arm Control
        if 'arm_out' in cmd:
            v = max(-1.0, min(1.0, cmd['arm_out']))
            self.robot.arm.set_velocity(v)
        
        # Wrist Control
        if 'wrist_roll_counterclockwise' in cmd:
            v = max(-1.0, min(1.0, cmd['wrist_roll_counterclockwise']))
            self.robot.end_of_arm.get_joint('wrist_roll').set_velocity(v)
        
        if 'wrist_pitch_up' in cmd:
            v = max(-1.0, min(1.0, cmd['wrist_pitch_up']))
            self.robot.end_of_arm.get_joint('wrist_pitch').set_velocity(v)
        
        if 'wrist_yaw_counterclockwise' in cmd:
            v = max(-1.0, min(1.0, cmd['wrist_yaw_counterclockwise']))
            self.robot.end_of_arm.get_joint('wrist_yaw').set_velocity(v)
        
        # Gripper Control
        if 'gripper_open' in cmd:
            v = max(-1.0, min(1.0, cmd['gripper_open']))
            self.robot.end_of_arm.get_joint('stretch_gripper').set_velocity(v)
        
        self.robot.push_command()

