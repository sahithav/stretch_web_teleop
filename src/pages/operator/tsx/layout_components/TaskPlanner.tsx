import React, { useState } from "react";
import {
    CustomizableComponentProps,
    isSelected,
} from "./CustomizableComponent";
import { className } from "shared/util";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import CloseIcon from "@mui/icons-material/Close";
import "operator/css/TaskPlanner.css";

/** Properties for {@link TaskPlanner} */
type TaskPlannerProps = CustomizableComponentProps;

// Hardcoded tasks
const HARDCODED_TASKS = [
    {
        id: 'task1',
        name: 'Grasp Object',
        description: 'Move arm forward and close gripper',
        code: `Move_Arm_to_Config(\"arm_out\")
Adjust_Gripper_Width(0.0)`
    },
    {
        id: 'task2',
        name: 'Place Object',
        description: 'Open gripper and retract arm',
        code: `Adjust_Gripper_Width(1.0)
Move_Arm_to_Config(\"arm_in\")`
    },
    {
        id: 'task3',
        name: 'Reset Robot',
        description: 'Return robot to home position',
        code: `Reset_Robot()`
    }
];

/**
 * Task Planner Component
 * Displays hardcoded tasks that can be executed
 */
export const TaskPlanner = (props: TaskPlannerProps) => {
    const { customizing } = props.sharedState;
    const selected = isSelected(props);
    const [selectedTask, setSelectedTask] = useState<string | null>(null);
    const [isExecuting, setIsExecuting] = useState(false);

    /** Callback when component is clicked during customize mode */
    const onSelect = (event: React.MouseEvent<HTMLDivElement>) => {
        event.stopPropagation();
        props.sharedState.onSelect(props.definition, props.path);
    };

    // In customizing state add onClick callback
    const selectProp = customizing ? { onClick: onSelect } : {};

    const handleTaskSelect = (taskId: string) => {
        setSelectedTask(taskId);
    };

    const handleRunTask = async () => {
        if (!selectedTask) return;
        
        setIsExecuting(true);
        const task = HARDCODED_TASKS.find(t => t.id === selectedTask);
        
        if (!task) {
            console.error('Task not found');
            setIsExecuting(false);
            return;
        }

        // Parse the task code and execute commands
        const commands = task.code.split('\n');
        
        for (const command of commands) {
            const trimmedCommand = command.trim();
            if (!trimmedCommand) continue;

            console.log(`Executing: ${trimmedCommand}`);
            
            // Parse and execute command
            if (trimmedCommand.match(/^Move_Arm_to_Config\s*\(/)) {
                const match = trimmedCommand.match(/Move_Arm_to_Config\s*\(\s*"([^"]+)"\s*\)/);
                if (match && (window as any).remoteRobot) {
                    const configName = match[1];
                    // Execute arm movement
                    (window as any).remoteRobot.executeArmConfig(configName);
                }
            } else if (trimmedCommand.match(/^Adjust_Gripper_Width\s*\(/)) {
                const match = trimmedCommand.match(/Adjust_Gripper_Width\s*\(\s*([0-9.]+)\s*\)/);
                if (match && (window as any).remoteRobot) {
                    const width = parseFloat(match[1]);
                    // Execute gripper adjustment
                    (window as any).remoteRobot.executeGripperAdjust(width);
                }
            } else if (trimmedCommand.match(/^Reset_Robot\s*\(/)) {
                if ((window as any).remoteRobot) {
                    // Execute robot reset
                    (window as any).remoteRobot.executeResetRobot();
                }
            }
        }

        setIsExecuting(false);
    };

    return (
        <div className={className("task-planner", { customizing, selected })} {...selectProp}>
            <div className="task-planner-header">
                <h3>Task Planner</h3>
                <CloseIcon 
                    onClick={() => console.log('Close task planner')}
                    className="close-icon"
                />
            </div>
            
            <div className="task-list">
                {HARDCODED_TASKS.map(task => (
                    <div 
                        key={task.id}
                        className={`task-item ${selectedTask === task.id ? 'selected' : ''}`}
                        onClick={() => handleTaskSelect(task.id)}
                    >
                        <div className="task-name">{task.name}</div>
                        <div className="task-description">{task.description}</div>
                        <div className="task-code">
                            <pre>{task.code}</pre>
                        </div>
                    </div>
                ))}
            </div>

            <div className="task-planner-footer">
                <button
                    className={`run-task-button ${isExecuting ? 'executing' : ''}`}
                    onClick={handleRunTask}
                    disabled={!selectedTask || isExecuting}
                >
                    <PlayArrowIcon />
                    <span>{isExecuting ? 'Executing...' : 'Run Task'}</span>
                </button>
            </div>
        </div>
    );
};

