import React from "react";
import "study/css/StudyLanding.css";

interface StudyLandingProps {
    onBeginStudy: () => void;
}

export const StudyLanding: React.FC<StudyLandingProps> = ({ onBeginStudy }) => {
    return (
        <div className="study-landing">
            <div className="study-landing-content">
                <h1>Robot Teleoperation Study</h1>
                
                <div className="study-intro">
                    <p>
                        Welcome to our robot teleoperation study! This study will help us understand 
                        how different interface modes affect user performance and experience when 
                        controlling a robot.
                    </p>
                    
                    <p>
                        You will be asked to complete 4 different tasks using three different modes:
                    </p>
                    
                    <ul>
                        <li><strong>Demonstrate Mode:</strong> Direct control of the robot</li>
                        <li><strong>Program Editor Mode:</strong> Create and edit robot programs</li>
                        <li><strong>Execution Monitor Mode:</strong> Monitor and supervise robot execution</li>
                    </ul>
                    
                    <p>
                        Each task will take approximately 10-15 minutes to complete. 
                        Please read the consent form carefully before beginning.
                    </p>
                </div>
                
                <div className="study-actions">
                    <a 
                        href="#" 
                        className="consent-link"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        📄 Read Consent Form
                    </a>
                    
                    <button 
                        className="begin-study-btn"
                        onClick={onBeginStudy}
                    >
                        Begin Study
                    </button>
                </div>
            </div>
        </div>
    );
}; 