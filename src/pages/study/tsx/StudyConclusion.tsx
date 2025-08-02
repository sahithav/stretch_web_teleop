import React from "react";
import "../css/StudyConclusion.css";

export const StudyConclusion: React.FC = () => {
    return (
        <div className="study-conclusion">
            <div className="study-conclusion-content">
                <h1>Thank You!</h1>
                
                <div className="study-thanks">
                    <p>
                        Thank you for participating in our robot teleoperation study! 
                        Your feedback and participation are invaluable to our research.
                    </p>
                    
                    <p>
                        We hope you found the experience interesting and informative. 
                        Your responses will help us improve robot interface design and 
                        understand how different interaction modes affect user experience.
                    </p>
                    
                    <p>
                        Please take a moment to complete our post-study questionnaire. 
                        This will help us gather additional insights about your experience.
                    </p>
                </div>
                
                <div className="study-actions">
                    <a 
                        href="#" 
                        className="questionnaire-link"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        📋 Complete Post-Study Questionnaire
                    </a>
                    
                    <p className="study-complete">
                        Study Complete ✓
                    </p>
                </div>
            </div>
        </div>
    );
}; 