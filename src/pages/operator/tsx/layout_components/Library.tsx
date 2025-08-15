import React, { useState } from "react";
import {
    CustomizableComponentProps,
    isSelected,
} from "./CustomizableComponent";
import { className, RobotPose } from "shared/util";
import "operator/css/Library.css";

// Mapping from user's joint order to ValidJoints (filtered to only valid joints)
const JOINT_MAPPING = [
    null,                   
    null,                    
    "joint_lift",            
    "wrist_extension",       // Sum of joint_arm_l0 + joint_arm_l1 + joint_arm_l2 + joint_arm_l3
    null,                   
    null,                    
    null,                    
    "joint_wrist_yaw",      
    "joint_head_pan",        
    "joint_head_tilt",                        
    "joint_wrist_pitch",    
    "joint_wrist_roll",
    null,      
    "joint_gripper_finger_left" 
];

interface SavedPosition {
    name: string;
    jointStates: string;
    timestamp: Date;
}

/**
 * A library component that displays functions and saved configurations
 * 
 * @param props {@link CustomizableComponentProps}
 */
export const Library = (props: CustomizableComponentProps) => {
    const { customizing } = props.sharedState;
    const selected = isSelected(props);
    
            // Check if human API functions should be hidden (tasks R and C)
    const shouldHideHumanAPI = () => {
        // Get the current task and task order from sharedState
        const currentTask = props.sharedState.studyMode?.currentTask;
        const taskOrder = props.sharedState.studyMode?.taskOrder;
        const isPracticeRound = props.sharedState.studyMode?.isPracticeRound;
        
        // In practice round, always show human API functions
        if (isPracticeRound) {
            return false;
        }
        
        if (!currentTask || !taskOrder || taskOrder.length === 0) {
            console.log('Library: No study mode data available, showing human API functions');
            return false;
        }
        
        const taskLetter = taskOrder[currentTask - 1];
        console.log('Library: Current task letter:', taskLetter);
        
        // Hide human API for task C, show for task L 
        const shouldHide = taskLetter === 'C';
        console.log('Library: Should hide human API functions:', shouldHide);
        return shouldHide;
    };
    
    // Load saved configurations from session storage or use defaults
    const getInitialSavedPositions = (): SavedPosition[] => {
        const sessionPositions = sessionStorage.getItem('librarySavedPositions');
        if (sessionPositions) {
            try {
                const parsed = JSON.parse(sessionPositions);
                return parsed.map((pos: any) => ({
                    ...pos,
                    timestamp: new Date(pos.timestamp)
                }));
            } catch (error) {
                console.error("Error parsing saved configurations:", error);
            }
        }
        // No default positions - temporary  
        return [];
    };
    
    const [savedPositions, setSavedPositions] = useState<SavedPosition[]>(getInitialSavedPositions());
    const [showModal, setShowModal] = useState(false);
    const [newPositionName, setNewPositionName] = useState("");
    const [newJointStates, setNewJointStates] = useState("");
    const [validationError, setValidationError] = useState<string>("");

    /** Callback when component is clicked during customize mode */
    const onSelect = (event: React.MouseEvent<HTMLDivElement>) => {
        event.stopPropagation();
        props.sharedState.onSelect(props.definition, props.path);
    };

    const selectProp = customizing ? { onClick: onSelect } : {};

    // Function to parse joint values from user input
    const parseJointValues = (valuesString: string): RobotPose => {
        // Remove brackets and split by comma
        const cleanString = valuesString.replace(/[\[\]]/g, '');
        const values = cleanString.split(',').map(v => parseFloat(v.trim()));
        const pose: RobotPose = {};
        
        // Calculate wrist_extension as sum of arm segments (positions 3, 4, 5, 6)
        let wristExtensionSum = 0;
        if (values.length >= 7) {
            wristExtensionSum = values[3] + values[4] + values[5] + values[6]; // joint_arm_l3 + joint_arm_l2 + joint_arm_l1 + joint_arm_l0
        }
        
        values.forEach((value, index) => {
            if (index < JOINT_MAPPING.length && !isNaN(value)) {
                const jointName = JOINT_MAPPING[index];
                // Only add to pose if jointName is not null (valid joint)
                if (jointName !== null) {
                    if (jointName === "wrist_extension") {
                        pose[jointName as keyof RobotPose] = wristExtensionSum;
                    } else {
                        pose[jointName as keyof RobotPose] = value;
                    }
                }
            }
        });
        
        return pose;
    };

    // Validate joint positions input
    const validateJointStates = (input: string): boolean => {
        try {
            // Parse the input as JSON array
            const values = JSON.parse(input);
            if (!Array.isArray(values) || values.length !== 14) {
                setValidationError("Invalid joint positions, copy and paste position from demo recording.");
                return false;
            }
            return true;
        } catch (error) {
            setValidationError("Invalid joint positions, copy and paste position from demo recording.");
            return false;
        }
    };

    // Handle adding new position
    const handleAddPosition = () => {
        // Validate joint positions format
        if (!validateJointStates(newJointStates)) {
            setValidationError("Invalid joint positions, copy and paste position from demo recording.");
            return;
        }
        
        try {
            // Parse the joint values into a proper RobotPose
            const pose = parseJointValues(newJointStates);
            
            const newPosition: SavedPosition = {
                name: newPositionName.trim(),
                jointStates: newJointStates.trim(),
                timestamp: new Date()
            };
            const updatedPositions = [...savedPositions, newPosition];
            setSavedPositions(updatedPositions);
            
            // Save to session storage
            sessionStorage.setItem('librarySavedPositions', JSON.stringify(updatedPositions));
            
            // Add to program editor's autocomplete and syntax highlighting
            props.sharedState.addSavedPosition?.(newPositionName.trim());
            
            // Store the pose in the shared state for the program editor to use
            if ((props.sharedState as any).addCustomPose) {
                (props.sharedState as any).addCustomPose(newPositionName.trim(), pose);
            }
            
            // Log the saved position data for tracking
            if (props.sharedState && (props.sharedState as any).trackSavedPositionAdded) {
                const savedPositionData = {
                    name: newPositionName.trim(),
                    jointStates: pose, 
                    timestamp: new Date().toISOString()
                };
                (props.sharedState as any).trackSavedPositionAdded(savedPositionData);
            }
            
            setNewPositionName("");
            setNewJointStates("");
            setValidationError("");
            setShowModal(false);
        } catch (error) {
            console.error("Error parsing joint values:", error);
            setValidationError("Invalid joint states, copy and paste position from demo recording.");
        }
    };

    // Handle cancel button
    const handleCancel = () => {
        setNewPositionName("");
        setNewJointStates("");
        setValidationError("");
        setShowModal(false);
    };

    return (
        <div
            className={className("library-root", {
                customizing,
                selected,
            })}
            {...selectProp}
        >
            <div className="library-content">
                <div className="library-sections-container">
                    {/* Functions Section */}
                    <div className="library-section">
                        <h3 className="library-section-title" style={{ fontWeight: "600", color: "#ff8c00" }}>Robot Functions</h3>
                        
                        <div className="library-subsection">
                            <div className="library-text">
                                <div className="function-group">
                                    <div 
                                        className="library-function-item"
                                        onClick={() => props.sharedState.insertTextAtCursor?.("Move_Arm_to_Config()\n")}
                                        style={{ marginBottom: "12px" }}
                                    >
                                        <span style={{ fontWeight: "600", fontSize: "0.9em" }}>Move_Arm_to_Config</span>(<span style={{ color: '#6c757d' }}>configuration name</span>)
                                    </div>
                                    <div className="function-description">
                                        Adjust the lift and extension of the robot's arm.{'\n'}
                                        Input: Saved configuration from demo recording.
                                    </div>
                                </div>
                                <div className="function-group">
                                    <div 
                                        className="library-function-item"
                                        onClick={() => props.sharedState.insertTextAtCursor?.("Adjust_Gripper_Width()\n")}
                                        style={{ marginBottom: "12px" }}
                                    >
                                        <span style={{ fontWeight: "600", fontSize: "0.9em" }}>Adjust_Gripper_Width</span>(<span style={{ color: '#6c757d' }}>configuration name</span>)
                                    </div>
                                    <div className="function-description">
                                        Adjust the width of the robot's gripper. {'\n'}
                                        Input: Saved configuration from demo recording.
                                    </div>
                                </div>
                                <div className="function-group">
                                    <div 
                                        className="library-function-item"
                                        onClick={() => props.sharedState.insertTextAtCursor?.("Rotate_Wrist_to_Config()\n")}
                                        style={{ marginBottom: "12px" }}
                                    >
                                        <span style={{ fontWeight: "600", fontSize: "0.9em" }}>Rotate_Wrist_to_Config</span>(<span style={{ color: '#6c757d' }}>configuration name</span>)
                                    </div>
                                    <div className="function-description">
                                        Adjust the angle of the robot's wrist.{'\n'}
                                        Input: Saved configuration from demo recording.
                                    </div>
                                </div>
                                <div className="function-group">
                                    <div 
                                        className="library-function-item"
                                        onClick={() => props.sharedState.insertTextAtCursor?.("Reset_Robot()\n")}
                                        style={{ marginBottom: "12px" }}
                                    >
                                        <span style={{ fontWeight: "600", fontSize: "0.9em" }}>Reset_Robot</span>()
                                    </div>
                                    <div className="function-description">
                                        Reset the robot to its home position.{'\n'}
                                        Input: N/A
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        {!shouldHideHumanAPI() && (
                            <>
                                <h3 className="library-section-title" style={{ fontWeight: "600", marginTop: "16px", color: "#28a745" }}>Human Functions</h3>
                                <div className="library-subsection">
                                    <div className="library-text">
                                        <div className="function-group">
                                            <div 
                                                className="library-function-item"
                                                onClick={() => props.sharedState.insertTextAtCursor?.("Pause_And_Confirm()\n")}
                                                style={{ marginBottom: "12px" }}
                                            >
                                                <span style={{ fontWeight: "600", fontSize: "0.9em" }}>Pause_And_Confirm</span>()
                                            </div>
                                            <div className="function-description">
                                                Pause execution and wait for your confirmation.{'\n'}
                                                Input(Optional): Message shown while execution is paused.
                                            </div>
                                        </div>
                                        <div className="function-group">
                                            <div 
                                                className="library-function-item"
                                                onClick={() => props.sharedState.insertTextAtCursor?.("Take_Control()\n")}
                                                style={{ marginBottom: "12px" }}
                                            >
                                                <span style={{ fontWeight: "600", fontSize: "0.9em" }}>Take_Control</span>()
                                            </div>
                                            <div className="function-description">
                                                Control the robot by tele-operating it.{'\n'}
                                                Input: N/A
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                    
                    {/* Saved Configurations Section */}
                    <div className="library-section" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                        <h3 className="library-section-title">Saved Configurations</h3>
                        <div className="library-subsection" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                            <div className="library-text">
                                {savedPositions.map((position, index) => (
                                    <div 
                                        key={index}
                                        className="library-function-item"
                                        onClick={() => props.sharedState.insertTextAtCursor?.(position.name)}
                                    >
                                        {position.name}
                                    </div>
                                ))}
                            </div>
                            <div style={{ 
                                paddingTop: "8px",
                                paddingBottom: "8px"
                            }}>
                                <button 
                                    className="add-position-btn"
                                    onClick={() => setShowModal(true)}
                                    style={{
                                        width: "100%",
                                        textAlign: "center",
                                        display: "flex",
                                        justifyContent: "center",
                                        alignItems: "center"
                                    }}
                                >
                                    + Add Configuration
                                </button>
                            </div>
                            <div style={{ 
                                marginTop: "auto",
                                display: "flex", 
                                justifyContent: "flex-end",
                                paddingTop: "8px"
                            }}>
                                <button 
                                    className="clear-positions-btn"
                                    onClick={() => {
                                        // Reset to empty positions
                                        setSavedPositions([]);
                                        sessionStorage.removeItem('librarySavedPositions');
                                    }}
                                    style={{
                                        minWidth: "auto",
                                        maxWidth: "auto",
                                        flex: "none"
                                    }}
                                >
                                    Clear
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* Modal */}
            {showModal && (
                <div style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    width: "100vw",
                    height: "100vh",
                    background: "rgba(0,0,0,0.4)",
                    zIndex: 1000,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                }}>
                    <div style={{
                        background: "white",
                        borderRadius: 8,
                        padding: 32,
                        minWidth: 400,
                        maxWidth: 500,
                        boxShadow: "0 2px 16px rgba(0,0,0,0.2)",
                        textAlign: "center"
                    }}>
                        <div style={{ fontSize: "1.2em", marginBottom: 24 }}>
                            Add New Configuration
                        </div>
                        <div style={{ 
                            display: "flex", 
                            flexDirection: "column", 
                            gap: 16,
                            textAlign: "left",
                            marginBottom: 24
                        }}>
                            <div>
                                <label style={{ 
                                    display: "block", 
                                    marginBottom: 6,
                                    fontWeight: "bold",
                                    fontSize: "0.9em"
                                }}>
                                    Configuration Name
                                </label>
                                <input
                                    type="text"
                                    value={newPositionName}
                                    onChange={(e) => setNewPositionName(e.target.value)}
                                    placeholder="e.g.pickup_pose"
                                    style={{
                                        width: "100%",
                                        padding: "8px 12px",
                                        border: "1px solid #ccc",
                                        borderRadius: 4,
                                        fontSize: "0.9em"
                                    }}
                                />
                            </div>
                            <div>
                                <label style={{ 
                                    display: "block", 
                                    marginBottom: 6,
                                    fontWeight: "bold",
                                    fontSize: "0.9em"
                                }}>
                                    Joint Positions
                                </label>
                                <input
                                    type="text"
                                    value={newJointStates}
                                    onChange={(e) => setNewJointStates(e.target.value)}
                                    placeholder="e.g.[0.0,...,0.0]"
                                    style={{
                                        width: "100%",
                                        padding: "8px 12px",
                                        border: validationError ? "1px solid #f44336" : "1px solid #ccc",
                                        borderRadius: 4,
                                        fontSize: "0.9em"
                                    }}
                                />
                                {validationError && (
                                    <div style={{ 
                                        color: "#f44336", 
                                        fontSize: "0.75em", 
                                        marginTop: "4px"
                                    }}>
                                        Invalid joint positions, copy and paste position from demo recording.
                                    </div>
                                )}
                            </div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "center", gap: 16 }}>
                            <button
                                style={{
                                    backgroundColor: "#6c757d",
                                    color: "white",
                                    border: "none",
                                    padding: "10px 20px",
                                    fontWeight: "bold",
                                    borderRadius: "5px",
                                    cursor: "pointer"
                                }}
                                onClick={handleCancel}
                            >
                                Cancel
                            </button>
                            <button
                                style={{
                                    background: "#4caf50",
                                    color: "white",
                                    border: "none",
                                    borderRadius: 4,
                                    padding: "8px 20px",
                                    fontWeight: "bold",
                                    fontSize: "1em",
                                    cursor: "pointer",
                                    opacity: (!newPositionName.trim() || !newJointStates.trim()) ? 0.5 : 1
                                }}
                                onClick={handleAddPosition}
                                disabled={!newPositionName.trim() || !newJointStates.trim()}
                            >
                                Save Configuration
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}; 