import React from "react";
import "../css/PracticeRoundModal.css";

interface PracticeRoundModalProps {
    onProceedToPractice: () => void;
}

export const PracticeRoundModal: React.FC<PracticeRoundModalProps> = ({ onProceedToPractice }) => {
    return (
        <div className="practice-round-modal-overlay">
            <div className="practice-round-modal">
                <div className="practice-round-modal-content">
                    <h2>Practice Round</h2>
                    
                    <div className="practice-round-description">
                        <p>
                            This is a practice round to familiarize yourself with the interface and controls.
                        </p>
                        
                        <div className="practice-task">
                            <h3>Practice Task:</h3>
                            <p>Pick up the cube and place it down in the same spot.</p>
                        </div>
                        
                        <div className="practice-instructions">
                            <h4>What you'll do:</h4>
                            <ol>
                                <li>Record yourself manually controlling the robot to demonstrate the task.</li>
                                <li>Create and execute a program using available functions and data from your recording.</li>
                                <li>Familiarize yourself with the interface and controls.</li>
                            </ol>
                        </div>
                        
                        <div className="practice-note">
                            <p><strong>Note:</strong> This practice round is for learning purposes only. No data will be recorded.</p>
                        </div>
                    </div>
                    
                    <div className="practice-round-actions">
                        <button 
                            className="proceed-to-practice-btn"
                            onClick={onProceedToPractice}
                        >
                            Begin Practice Round
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}; 