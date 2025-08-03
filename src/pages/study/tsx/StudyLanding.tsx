import React from "react";
import "../css/StudyLanding.css";

interface StudyLandingProps {
    onBeginStudy: () => void;
}

export const StudyLanding: React.FC<StudyLandingProps> = ({ onBeginStudy }) => {
    // Generate random user ID between 1 and 999
    const [userId] = React.useState(() => Math.floor(Math.random() * 999) + 1);
    
    // Store user ID in session storage for use throughout the study
    React.useEffect(() => {
        sessionStorage.setItem('studyUserId', userId.toString());
    }, [userId]);
    
    return (
        <div className="study-landing">
            <div className="study-landing-content">
                <h1>Shared Autonomy Study</h1>
                
                <div className="study-intro">
                    <p>
                        Thank you for participating. This study aims to explore how people interact with robots in shared autonomy settings. You will be asked to use a web-based interface to control a robot and answer questions to evaluate your experience with using the system.
                    </p>
                    
                    <p>
                        You will complete four tasks, each involving:
                    </p>
                    
                    <ul>
                        <li>Recording yourself manually controlling the robot to demonstrate the task.</li>
                        <li>Creating and executing a program using available functions and data from your recording.</li>
                    </ul>
                    
                    <p>
                        Each task is expected to take approximately 10–15 minutes.
                        Before you begin, please read and sign the consent form carefully.
                    </p>
                    
                    <div className="user-id-display">
                        <p><strong>Your User ID: {userId}</strong></p>
                    </div>
                </div>
                
                <div className="study-actions">
                    <a 
                        href="https://docs.google.com/forms/d/e/1FAIpQLSecrYP9Vj3Nu7BtFQAN6i1FvJETd19KuJPdv4VeTKUOVCG-xA/viewform?usp=dialog" 
                        className="consent-link"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        📄 Consent Form
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