import React from "react";
import "../css/StudyConclusion.css";

export const StudyConclusion: React.FC = () => {
    // Get user ID from session storage
    const userId = sessionStorage.getItem('studyUserId') || 'Unknown';
    
    return (
        <div className="study-conclusion">
            <div className="study-conclusion-content">
                <h1>Thank You!</h1>
                
                <div className="study-thanks">
                    <p>
                        Thank you for participating in our shared autonomy study! 
                        Your feedback and participation are invaluable to our research.
                    </p>
                    
                    <p>
                        We hope you found the experience interesting and informative. 
                        Your responses will help us improve robot interface design and 
                        understand how different interaction modes affect user experience.
                    </p>
                    
                    <p>
                        Please complete our post-study questionnaire. 
                        This will help us gather additional insights about your experience.
                    </p>
                    
                    <div className="user-id-display">
                        <p>
                            <strong>Your User ID: </strong>
                            <span className="user-id-value">
                                {userId}
                                <span 
                                    className="copy-icon"
                                    onClick={() => {
                                        navigator.clipboard.writeText(userId);
                                        // Brief feedback
                                        const icon = document.querySelector('.copy-icon');
                                        if (icon) {
                                            const originalText = icon.textContent;
                                            icon.textContent = ' ✓';
                                            setTimeout(() => {
                                                icon.textContent = originalText;
                                            }, 1000);
                                        }
                                    }}
                                    title="Copy User ID to clipboard"
                                >
                                    ⎘
                                </span>
                            </span>
                        </p>
                    </div>
                </div>
                
                <div className="study-actions">
                    <a 
                        href="https://docs.google.com/forms/d/e/1FAIpQLScY7rERkwkHS0kaidTkwdZVlcfoxao7a2pUWzrUZ8kG8nEBlg/viewform?usp=dialog" 
                        className="questionnaire-link"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        📋 Post-Study Questionnaire
                    </a>
                    
                    <p className="study-complete">
                        Study Complete ✓
                    </p>
                </div>
            </div>
        </div>
    );
}; 