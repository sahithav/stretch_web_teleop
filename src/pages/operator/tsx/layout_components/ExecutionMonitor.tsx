import React, { useState, useEffect } from "react";
import {
    CustomizableComponentProps,
    SharedState,
    isSelected,
} from "./CustomizableComponent";
import { className } from "shared/util";
import CloseIcon from "@mui/icons-material/Close";
import CheckIcon from "@mui/icons-material/Check";
import ErrorIcon from "@mui/icons-material/Error";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import "operator/css/ExecutionMonitor.css";

/** Properties for {@link ExecutionMonitor} */
type ExecutionMonitorProps = CustomizableComponentProps & {
    /* Programming language for syntax highlighting */
    language?: string;
};

// Robot functions 
const ROBOT_FUNCTIONS = [
    'MoveEEToPose',
    'AdjustGripperWidth', 
    'RotateEE',
    'ResetRobot'
];

// Human functions 
const HUMAN_FUNCTIONS = [
    'PauseAndConfirm',
    'TakeControl'
];

// Default saved positions 
const DEFAULT_SAVED_POSITIONS = [
    // No default positions for now
];

/**
 * A read-only display component that shows the program from the ProgramEditor
 * with syntax highlighting and line numbers
 *
 * @param props {@link ExecutionMonitorProps}
 */
export const ExecutionMonitor = (props: ExecutionMonitorProps) => {
    // State management
    const [code, setCode] = useState<string>("");
    const [lineNumbers, setLineNumbers] = useState<string[]>([]);
    const [savedPositions, setSavedPositions] = useState<string[]>(DEFAULT_SAVED_POSITIONS);
    const [showDoneMessage, setShowDoneMessage] = useState(false);
    const [isExecuting, setIsExecuting] = useState(false);
    const prevIsExecutingRef = React.useRef(false);
    
    const { customizing, currentExecutingLine, isExecutingProgram, isProgramFinished, setIsProgramFinished, waitingForUserConfirmation, handleDoneTeleoperating, executionError, clearExecutionError, errorLineNumber } = props.sharedState;
    const selected = isSelected(props);

  
    // Create dynamic array that updates when savedPositions changes
    const allFunctions = React.useMemo(() => {
        return [...ROBOT_FUNCTIONS, ...HUMAN_FUNCTIONS, ...savedPositions];
    }, [savedPositions]);

    // Load code from session storage
    useEffect(() => {
        console.log('ExecutionMonitor: taskKey changed to:', props.sharedState.taskKey);
        console.log('ExecutionMonitor: Reloading code from session storage');
        const sessionCode = sessionStorage.getItem('programEditorCode');
        if (sessionCode) {
            setCode(sessionCode);
        } else {
            setCode(""); // Clear if no session code
        }
    }, [props.sharedState.taskKey]);

    // Load saved positions from session storage
    useEffect(() => {
        const sessionPositions = sessionStorage.getItem('programEditorSavedPositions');
        if (sessionPositions) {
            try {
                const parsed = JSON.parse(sessionPositions);
                setSavedPositions(parsed);
            } catch (error) {
                console.error("Error parsing saved positions:", error);
            }
        }
    }, [props.sharedState.taskKey]);

    // Update line numbers when code changes
    useEffect(() => {
        const lines = code.split('\n');
        const numbers = lines.map((_, index) => (index + 1).toString());
        setLineNumbers(numbers);
    }, [code]);

    // Message when program finishes executing
    useEffect(() => {
        // Reset program finished state when starting execution
        if (!prevIsExecutingRef.current && isExecutingProgram) {
            if (setIsProgramFinished) {
                setIsProgramFinished(false);
            }
        }
        
        // Show done message when program is finished successfully
        if (isProgramFinished && !executionError) {
            setShowDoneMessage(true);
            
            // Track successful execution completion for study data
            if (props.sharedState && (props.sharedState as any).trackExecutionAttemptEnd) {
                (props.sharedState as any).trackExecutionAttemptEnd(true);
            }
            
            const timer = setTimeout(() => {
                setShowDoneMessage(false);
            }, 5000); 
            
            return () => clearTimeout(timer);
        } else if (isProgramFinished && executionError) {
            // Track failed execution completion for study data
            if (props.sharedState && (props.sharedState as any).trackExecutionAttemptEnd) {
                (props.sharedState as any).trackExecutionAttemptEnd(false);
            }
        } else if (isExecutingProgram) {
            // Program is executing, hide done message
            setShowDoneMessage(false);
        }
        prevIsExecutingRef.current = isExecutingProgram;
    }, [isExecutingProgram, isProgramFinished, executionError]);

    // Function to handle Run/Stop Program button click
    const handleRunProgram = async () => {
        console.log("ExecutionMonitor: handleRunProgram called, current isExecuting:", isExecuting);
        console.log("ExecutionMonitor: window.programEditorRunFunction exists:", !!(window as any).programEditorRunFunction);
        console.log("ExecutionMonitor: Available window functions:", Object.keys(window).filter(key => key.includes('program')));
        
        // Try multiple ways to call the ProgramEditor's run function
        const programEditorRunFunction = (window as any).programEditorRunFunction;
        if (programEditorRunFunction) {
            console.log("ExecutionMonitor: Calling programEditorRunFunction");
            programEditorRunFunction();
        } else {
            console.log("ExecutionMonitor: ProgramEditor function not found, trying alternative approach");
            
            // Try to find the ProgramEditor component in the current layout and call its function
            const programEditorElement = document.querySelector('.program-editor-root');
            if (programEditorElement) {
                console.log("ExecutionMonitor: Found ProgramEditor element, trying to trigger its run button");
                const runButton = programEditorElement.querySelector('.run-program-button');
                if (runButton) {
                    console.log("ExecutionMonitor: Found run button, clicking it");
                    (runButton as HTMLElement).click();
                } else {
                    console.error("ExecutionMonitor: Run button not found in ProgramEditor");
                }
            } else {
                console.error("ExecutionMonitor: ProgramEditor element not found in DOM");
            }
        }
    };

    // Function to handle button click (either run or stop)
    const handleButtonClick = () => {
        if (isExecuting) {
            console.log("ExecutionMonitor: Stop button clicked");
            handleStopProgram();
        } else {
            console.log("ExecutionMonitor: Run button clicked");
            handleRunProgram();
        }
    };

    // Update local execution state based on global state
    useEffect(() => {
        setIsExecuting(isExecutingProgram);
    }, [isExecutingProgram]);

    // Syntax highlighting function 
    const highlightSyntax = (text: string): string => {
        let highlightedText = text;
        
        // no highlighting in PauseAndConfirm parameters
        const pauseAndConfirmParams: string[] = [];
        let paramIndex = 0;
        highlightedText = highlightedText.replace(/PauseAndConfirm\s*\(\s*([^)]*)\s*\)/g, (match, content) => {
            const placeholder = `__PAUSE_CONFIRM_PARAM_${paramIndex}__`;
            pauseAndConfirmParams[paramIndex] = content;
            paramIndex++;
            return `PauseAndConfirm(${placeholder})`;
        });
        
        // Highlight robot functions in orange
        ROBOT_FUNCTIONS.forEach(func => {
            const regex = new RegExp(`\\b${func}\\b`, 'g');
            highlightedText = highlightedText.replace(regex, `<span class="robot-function">${func}</span>`);
        });
        
        HUMAN_FUNCTIONS.forEach(func => {
            const regex = new RegExp(`\\b${func}\\b`, 'g');
            highlightedText = highlightedText.replace(regex, `<span class="human-function">${func}</span>`);
        });
        
        // Highlight saved positions in blue
        savedPositions.forEach(position => {
            const regex = new RegExp(`\\b${position}\\b`, 'g');
            highlightedText = highlightedText.replace(regex, `<span class="saved-position">${position}</span>`);
        });
        
        // Restore PauseAndConfirm parameters without highlighting
        pauseAndConfirmParams.forEach((param, index) => {
            const placeholder = `__PAUSE_CONFIRM_PARAM_${index}__`;
            highlightedText = highlightedText.replace(placeholder, param);
        });
        
        return highlightedText;
    };

    /** Callback when component is clicked during customize mode */
    const onSelect = (event: React.MouseEvent<HTMLDivElement>) => {
        event.stopPropagation();
        props.sharedState.onSelect(props.definition, props.path);
    };

    const handleStopProgram = () => {
        // Stop the program execution 
        if ((window as any).stopExecutionRef) {
            (window as any).stopExecutionRef.current = true;
        }
        
        // Set execution state to false
        const buttonFunctionProvider = (window as any).buttonFunctionProvider;
        if (buttonFunctionProvider) {
            buttonFunctionProvider.setExecutionState(false);
        }
        
        // Reset current executing line
        if (props.sharedState.updateCurrentExecutingLine) {
            props.sharedState.updateCurrentExecutingLine(undefined);
        }
    };

    // In customizing state add onClick callback
    const selectProp = customizing ? { onClick: onSelect } : {};

    const highlightedCode = highlightSyntax(code);
    
    // Split code into lines for highlighting the current executing line
    const codeLines = code.split('\n');
    const highlightedLines = codeLines.map((line, index) => {
        const lineNumber = index + 1;
        const isExecuting = currentExecutingLine === lineNumber;
        const hasError = errorLineNumber === lineNumber;
        const highlightedLine = highlightSyntax(line);
        
        return (
            <div 
                key={index}
                className={className("code-line", {
                    executing: isExecuting && !hasError,
                    error: hasError
                })}
                dangerouslySetInnerHTML={{ __html: highlightedLine || '&nbsp;' }}
            />
        );
    });

    return (
        <div
            className={className("execution-monitor-root", {
                customizing,
                selected,
            })}
            {...selectProp}
        >
            <div className="execution-monitor-header">
                <div className="execution-monitor-header-left">
                    {props.language && (
                        <span className="execution-monitor-language">{props.language}</span>
                    )}
                </div>
                <div className="execution-monitor-header-right">
                    {showDoneMessage && (
                        <div style={{
                            color: "#2e7d32",
                            fontWeight: "bold",
                            fontSize: "17px",
                            display: "flex",
                            alignItems: "center",
                            marginRight: "16px"
                        }}>
                            Done Executing!
                        </div>
                    )}
                    {waitingForUserConfirmation && handleDoneTeleoperating && (
                        <button 
                            className="execution-monitor-done-button"
                            onClick={handleDoneTeleoperating}
                            type="button"
                            style={{
                                marginRight: "8px"
                            }}
                        >
                            <CheckIcon style={{ marginRight: "4px" }} />
                            Done teleoperating
                        </button>
                    )}
                    {!waitingForUserConfirmation && (
                        <button 
                            className="run-program-button"
                            onClick={handleButtonClick}
                            type="button"
                            style={{
                                backgroundColor: isExecuting ? "#dc3545" : undefined
                            }}
                        >
                            {isExecuting ? (
                                <>
                                    <CloseIcon style={{ marginRight: "4px" }} />
                                    Stop
                                </>
                            ) : (
                                <>
                                    <PlayArrowIcon style={{ marginRight: "4px" }} />
                                    Run
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>
            {executionError && (
                <div className="execution-monitor-error-banner">
                                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <ErrorIcon style={{ fontSize: "16px" }} />
                    {executionError.message}
                </div>
                    <button 
                        className="execution-monitor-error-close"
                        onClick={clearExecutionError}
                        type="button"
                    >
                        ×
                    </button>
                </div>
            )}
            <div className="execution-monitor-container">
                <div className="line-numbers">
                    {lineNumbers.map((number, index) => {
                        const lineNumber = index + 1;
                        const isExecuting = currentExecutingLine === lineNumber;
                        const hasError = errorLineNumber === lineNumber;
                        
                        return (
                            <div 
                                key={index} 
                                className={className("line-number", {
                                    executing: isExecuting && !hasError,
                                    error: hasError
                                })}
                            >
                                {number}
                            </div>
                        );
                    })}
                </div>
                <div className="monitor-wrapper">
                    <div className="code-display">
                        {highlightedLines}
                    </div>
                </div>
            </div>
        </div>
    );
}; 