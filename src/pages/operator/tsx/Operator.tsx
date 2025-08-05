import React from "react";
import { AudioControl } from "./static_components/AudioControl";
import { SpeedControl } from "./static_components/SpeedControl";
import { LayoutArea } from "./static_components/LayoutArea";
import { CustomizeButton } from "./static_components/CustomizeButton";
import { GlobalOptionsProps, Sidebar } from "./static_components/Sidebar";
import { SharedState } from "./layout_components/CustomizableComponent";
import {
    ActionMode,
    ComponentDefinition,
    ComponentType,
    LayoutDefinition,
} from "./utils/component_definitions";
import { className, ActionState, RemoteStream, RobotPose } from "shared/util";
import {
    buttonFunctionProvider,
    underMapFunctionProvider,
    underVideoFunctionProvider,
    homeTheRobotFunctionProvider,
    hasBetaTeleopKit,
    stretchTool,
} from ".";
import {
    ButtonPadButton,
    ButtonState,
    ButtonStateMap,
} from "./function_providers/ButtonFunctionProvider";
import { Dropdown } from "./basic_components/Dropdown";
import { PopupModal } from "./basic_components/PopupModal";
import {
    DEFAULT_LAYOUTS,
    DefaultLayoutName,
    StorageHandler,
} from "./storage_handler/StorageHandler";
import { FunctionProvider } from "./function_providers/FunctionProvider";
import {
    addToLayout,
    moveInLayout,
    removeFromLayout,
} from "./utils/layout_helpers";
import { MovementRecorder } from "./layout_components/MovementRecorder";
import { Alert } from "./basic_components/Alert";
import "operator/css/Operator.css";
import "operator/css/HomeRobotButton.css";
import { TextToSpeech } from "./layout_components/TextToSpeech";
import { HomeTheRobot, HomeTheRobotFunction } from "./layout_components/HomeTheRobot";
import { RosbagRecorder } from "./layout_components/RosbagRecorder";
import HomeIcon from "@mui/icons-material/Home";
import CheckIcon from "@mui/icons-material/Check";

/** Operator interface webpage */
export const Operator = (props: {
    remoteStreams: Map<string, RemoteStream>;
    layout: LayoutDefinition;
    storageHandler: StorageHandler;
    isReconnecting?: boolean;
    studyMode?: {
        currentTask: number;
        onProceedToNextTask: () => void;
        proceedButtonText: string;
        isPracticeRound?: boolean;
        taskOrder?: string[];
        taskDefinitions?: { [key: string]: string };
    };
}) => {
    // Layout and customization state
    const [customizing, setCustomizing] = React.useState<boolean>(false);
    const [selectedDefinition, setSelectedDefinition] = React.useState<ComponentDefinition>();
    const [selectedPath, setSelectedPath] = React.useState<string>();
    const [buttonStateMapRerender, setButtonStateMapRerender] = React.useState<boolean>(false);
    const [tabletOrientationRerender, setTabletOrientationRerender] = React.useState<boolean>(false);
    
    // Program execution state
    const [velocityScale, setVelocityScale] = React.useState<number>(0.8);
    const [isExecutingProgram, setIsExecutingProgram] = React.useState<boolean>(false);
    const [currentExecutingLine, setCurrentExecutingLine] = React.useState<number | undefined>(undefined);
    const [showExecutionMessage, setShowExecutionMessage] = React.useState<boolean>(false);
    const [isProgramFinished, setIsProgramFinished] = React.useState<boolean>(false);
    const [waitingForUserConfirmation, setWaitingForUserConfirmation] = React.useState<boolean>(false);
    const [pauseAndConfirmMessage, setPauseAndConfirmMessage] = React.useState<string>("");
    const [executionError, setExecutionError] = React.useState<{ type: 'syntax' | 'invalid_input' | 'unknown_pose'; message: string } | null>(null);
    const [errorLineNumber, setErrorLineNumber] = React.useState<number | null>(null);
    
    // Program mode state
    const [showPopup, setShowPopup] = React.useState<boolean>(false);
    const [programMode, setProgramMode] = React.useState<string>("Demonstrate");
    
    // Study confirmation popup state
    const [showStudyConfirmation, setShowStudyConfirmation] = React.useState<boolean>(false);
    const [showTaskDescription, setShowTaskDescription] = React.useState<boolean>(false);
    
    // Study data tracking
    const [studyData, setStudyData] = React.useState(() => {
        const userId = sessionStorage.getItem('studyUserId');
        if (!userId) return null;
        
        const existingData = sessionStorage.getItem(`studyData_${userId}`);
        if (existingData) {
            return JSON.parse(existingData);
        }
        
        return {
            metadata: {
                study_start_time: null,
                study_end_time: null
            },
            tasks: {}
        };
    });
    
    // Track current program editor session
    const [currentProgramSession, setCurrentProgramSession] = React.useState({
        session_start: null,
        saved_positions_added: 0
    });
    
    // Track current execution attempt
    const [currentExecutionAttempt, setCurrentExecutionAttempt] = React.useState({
        pause_and_confirm_resets: 0,
        execution_start: null as string | null
    });
    const hasTrackedExecutionEndRef = React.useRef(false);
    
    // Function to track saved position addition
    const getQuestionnaireUrl = (taskLetter: string): string => {
        switch (taskLetter) {
            case 'R':
                return 'https://docs.google.com/forms/d/e/1FAIpQLSdoTmoCgTXAtpBBrVoUR8Q5Gu-lNwlQbIpdOrt_vzVH1zCT3Q/viewform?usp=preview';
            case 'B':
                return 'https://docs.google.com/forms/d/e/1FAIpQLSdBPedZJWU3br5EZbC0__HmJ5GvwhwjJP0NRxW1Lm4KbOIk6g/viewform?usp=preview';
            case 'O':
                return 'https://docs.google.com/forms/d/e/1FAIpQLSc_Vq7SfH3gEThPPsEcK2vBpNh0CptfTkMKkwVqNOJzE4vWiw/viewform?usp=preview';
            case 'M':
                return 'https://docs.google.com/forms/d/e/1FAIpQLSePpvjDoGOfD3lmMFZYQBAyaw2SkVMay-5RivF6N6MbZ_tiBA/viewform?usp=preview';
            default:
                return '';
        }
    };

    const trackSavedPositionAdded = () => {
        if (programMode === "Program Editor" && currentProgramSession.session_start && !props.studyMode?.isPracticeRound) {
            setCurrentProgramSession(prev => ({
                ...prev,
                saved_positions_added: prev.saved_positions_added + 1
            }));
        }
    };
    
    // Function to track execution attempt start
    const trackExecutionAttemptStart = () => {
        if (props.studyMode && !props.studyMode.isPracticeRound) {
            console.log('=== Starting new execution attempt ===');
            // Reset tracking flag and start time
            hasTrackedExecutionEndRef.current = false;
            setCurrentExecutionAttempt({
                pause_and_confirm_resets: 0,
                execution_start: new Date().toISOString()
            });
        }
    };
    
    // Function to track execution attempt end
    const trackExecutionAttemptEnd = (success: boolean) => {
        console.log('=== trackExecutionAttemptEnd called ===');
        console.log('Success:', success);
        console.log('Already tracked:', hasTrackedExecutionEndRef.current);
        console.log('Execution start:', currentExecutionAttempt.execution_start);
        console.log('Pause and confirm resets:', currentExecutionAttempt.pause_and_confirm_resets);
        
        // Prevent duplicate tracking
        if (hasTrackedExecutionEndRef.current) {
            console.log('Execution already tracked, skipping duplicate');
            return;
        }

        if (props.studyMode && !props.studyMode.isPracticeRound && currentExecutionAttempt.execution_start) {
            const userId = sessionStorage.getItem('studyUserId');
            const currentTask = props.studyMode.currentTask;
            const taskOrder = props.studyMode.taskOrder;
            
            if (userId && currentTask && taskOrder) {
                const taskLetter = taskOrder[currentTask - 1];
                const existingData = sessionStorage.getItem(`studyData_${userId}`);
                if (existingData) {
                    const studyData = JSON.parse(existingData);
                    
                    if (!studyData.tasks[taskLetter]) {
                        studyData.tasks[taskLetter] = {
                            task_start_time: new Date().toISOString(),
                            task_end_time: null,
                            program_editor_sessions: [],
                            demonstration_recordings: [],
                            execution_attempts: []
                        };
                    }
                    
                    const executionData = {
                        execution_start: currentExecutionAttempt.execution_start,
                        execution_end: new Date().toISOString(),
                        success: success,
                        pause_and_confirm_resets: currentExecutionAttempt.pause_and_confirm_resets
                    };
                    
                    studyData.tasks[taskLetter].execution_attempts.push(executionData);
                    sessionStorage.setItem(`studyData_${userId}`, JSON.stringify(studyData));
                    
                    // Mark as tracked to prevent duplicates
                    hasTrackedExecutionEndRef.current = true;
                    
                    console.log('=== Execution attempt tracked successfully ===');
                    console.log('Execution data:', executionData);
                    console.log('Total execution attempts:', studyData.tasks[taskLetter].execution_attempts.length);
                }
            }
        }
    };
    
    // Function to track demonstration recording start
    const trackDemonstrationRecordingStart = () => {

        if (props.studyMode && !props.studyMode.isPracticeRound) {
            const userId = sessionStorage.getItem('studyUserId');
            const currentTask = props.studyMode.currentTask;
            const taskOrder = props.studyMode.taskOrder;
            
            console.log('User ID:', userId, 'Current Task:', currentTask);
            
            if (userId && currentTask && taskOrder) {
                const taskLetter = taskOrder[currentTask - 1];
                const existingData = sessionStorage.getItem(`studyData_${userId}`);
                if (existingData) {
                    const studyData = JSON.parse(existingData);
                    
                    if (!studyData.tasks[taskLetter]) {
                        studyData.tasks[taskLetter] = {
                            task_start_time: new Date().toISOString(),
                            task_end_time: null,
                            program_editor_sessions: [],
                            demonstration_recordings: [],
                            execution_attempts: []
                        };
                    }
                    
                    const recordingData = {
                        recording_start: new Date().toISOString(),
                        recording_end: null,
                        rosbag_name: null
                    };
                    
                    studyData.tasks[taskLetter].demonstration_recordings.push(recordingData);
                    sessionStorage.setItem(`studyData_${userId}`, JSON.stringify(studyData));
        
                }
            }
        }
    };
    
    // Function to track demonstration recording end
    const trackDemonstrationRecordingEnd = (rosbagName: string) => {

        if (props.studyMode && !props.studyMode.isPracticeRound) {
            const userId = sessionStorage.getItem('studyUserId');
            const currentTask = props.studyMode.currentTask;
            const taskOrder = props.studyMode.taskOrder;
            
            console.log('User ID:', userId, 'Current Task:', currentTask);
            
            if (userId && currentTask && taskOrder) {
                const taskLetter = taskOrder[currentTask - 1];
                const existingData = sessionStorage.getItem(`studyData_${userId}`);
                if (existingData) {
                    const studyData = JSON.parse(existingData);
                    
                    if (studyData.tasks && studyData.tasks[taskLetter] && studyData.tasks[taskLetter].demonstration_recordings.length > 0) {
                        const recordings = studyData.tasks[taskLetter].demonstration_recordings;
                        const lastRecording = recordings[recordings.length - 1];
                        lastRecording.recording_end = new Date().toISOString();
                        lastRecording.rosbag_name = rosbagName;
                        
                        sessionStorage.setItem(`studyData_${userId}`, JSON.stringify(studyData));
            
                    }
                }
            }
        }
    };
    
    // Show task description modal when study starts (Task 1) - but not during practice round
    React.useEffect(() => {
        if (props.studyMode && props.studyMode.currentTask === 1 && !props.studyMode.isPracticeRound) {
            setShowTaskDescription(true);
        }
    }, [props.studyMode?.currentTask, props.studyMode?.isPracticeRound]);
    
    // Function to update current executing line
    const updateCurrentExecutingLine = (lineNumber: number | undefined) => {
        setCurrentExecutingLine(lineNumber);
    };
    
    // Effect to handle execution message timing for Program Editor mode
    React.useEffect(() => {
        if (programMode === "Program Editor" && isExecutingProgram) {
            setShowExecutionMessage(true);
            const timer = setTimeout(() => {
                setShowExecutionMessage(false);
            }, 5000);
            return () => clearTimeout(timer);
        } else {
            setShowExecutionMessage(false);
        }
    }, [programMode, isExecutingProgram]);
    
    // Function to handle "Done teleoperating" button click
    const handleDoneTeleoperating = () => {
        setWaitingForUserConfirmation(false);
        
        // Stop automatic human API rosbag recording
        stopHumanApiRecording();
        
        // Set execution state back to true
        if ((window as any).buttonFunctionProvider) {
            (window as any).buttonFunctionProvider.setExecutionState(true);
        }
        if ((window as any).resumeProgramExecution) {
            (window as any).resumeProgramExecution();
            (window as any).resumeProgramExecution = null;
        }
    };
    
    // Effect to detect when TakeControl is called
    React.useEffect(() => {
        const checkForTakeControl = () => {
            if (!waitingForUserConfirmation && (window as any).resumeProgramExecution) {
                setWaitingForUserConfirmation(true);
            }
        };
        
        const interval = setInterval(checkForTakeControl, 100);
        return () => clearInterval(interval);
    }, [waitingForUserConfirmation]);

    // Function to handle "Confirm and Proceed" button click
    const handleConfirmAndProceed = () => {
        if ((window as any).pauseAndConfirmResolve) {
            (window as any).pauseAndConfirmResolve();
            (window as any).pauseAndConfirmResolve = null;
            (window as any).pauseAndConfirmMessage = null;
        }
        setIsProgramFinished(false);
    };

    // Function to handle "Reset" button click
    const handleReset = () => {

        
        // Track pause and confirm reset for study data
        if (props.studyMode && (window as any).pauseAndConfirmResolve) {
            console.log('=== Tracking pause and confirm reset ===');
            const newPauseAndConfirmResets = currentExecutionAttempt.pause_and_confirm_resets + 1;
            console.log('Updated pause_and_confirm_resets to:', newPauseAndConfirmResets);
            
            setCurrentExecutionAttempt(prev => ({
                ...prev,
                pause_and_confirm_resets: newPauseAndConfirmResets
            }));
            
            // Also update the current execution attempt immediately for tracking
            currentExecutionAttempt.pause_and_confirm_resets = newPauseAndConfirmResets;
        } else {
            console.log('=== NOT tracking pause and confirm reset ===');
            console.log('Reason: studyMode:', !!props.studyMode, 'pauseAndConfirmResolve:', !!(window as any).pauseAndConfirmResolve);
        }
        
        // Home the robot
        if ((window as any).remoteRobot) {
            (window as any).remoteRobot.homeTheRobot();
        }
        
        // Stop program execution
        if ((window as any).stopExecutionRef) {
            console.log('=== Stopping program execution ===');
            (window as any).stopExecutionRef.current = true;
        }
        
        // Clear pause and confirm state
        if ((window as any).pauseAndConfirmResolve) {
            (window as any).pauseAndConfirmResolve = null;
            (window as any).pauseAndConfirmMessage = null;
        }
        
        setIsProgramFinished(false);
        setIsExecutingProgram(false);
        
        // Clear current executing line
        updateCurrentExecutingLine(undefined);
        
        // Reset button function provider execution state
        if ((window as any).buttonFunctionProvider) {
            (window as any).buttonFunctionProvider.setExecutionState(false);
        }
    };

    // Effect to detect when PauseAndConfirm is called
    React.useEffect(() => {
        const checkForPauseAndConfirm = () => {
            if (isExecutingProgram && !showPopup && (window as any).pauseAndConfirmResolve && (window as any).pauseAndConfirmMessage) {
                setPauseAndConfirmMessage((window as any).pauseAndConfirmMessage);
                setShowPopup(true);
            }
        };
        
        const interval = setInterval(checkForPauseAndConfirm, 100);
        return () => clearInterval(interval);
    }, [isExecutingProgram, showPopup]);
    const [buttonCollision, setButtonCollision] = React.useState<
        ButtonPadButton[]
    >([]);
    const [moveBaseState, setMoveBaseState] = React.useState<ActionState>();
    const [moveToPregraspState, setMoveToPregraspState] =
        React.useState<ActionState>();
    const [showTabletState, setShowTabletState] =
        React.useState<ActionState>();
    const [robotNotHomed, setRobotNotHomed] =
        React.useState<boolean>(true); // Start as "not homed" until we get confirmation from ROS
    function showHomeTheRobotGlobalControl(isHomed: boolean) {
        setRobotNotHomed(!isHomed);
    }
    homeTheRobotFunctionProvider.setIsHomedCallback(
        showHomeTheRobotGlobalControl
    );

    const layout = React.useRef<LayoutDefinition>(props.layout);
    
    // Mode-specific layouts
    const [modeLayouts, setModeLayouts] = React.useState<{ [mode: string]: LayoutDefinition }>({
        "Demonstrate": props.layout,
        "Program Editor": props.layout,
        "Execution Monitor": props.layout,
    });

    // Initialize mode-specific layouts
    React.useEffect(() => {
        const initializeModeLayouts = () => {
            const programModes = ["Demonstrate", "Program Editor", "Execution Monitor"];
            const initialLayouts: { [mode: string]: LayoutDefinition } = {};
            
            programModes.forEach(mode => {
                const savedLayout = props.storageHandler.loadCurrentLayout(mode);
                // always use default layouts to ensure proper structure
                if (mode === "Demonstrate") {
                    initialLayouts[mode] = props.storageHandler.loadDefaultLayout("Basic Layout" as any);
                } else if (mode === "Program Editor") {
                    initialLayouts[mode] = props.storageHandler.loadDefaultLayout("Program Editor Layout" as any);
                } else if (mode === "Execution Monitor") {
                    initialLayouts[mode] = props.storageHandler.loadDefaultLayout("Execution Monitor Layout" as any);
                }
            });
            
            setModeLayouts(initialLayouts);
            // Set current layout to the current mode
            layout.current = initialLayouts[programMode];
        };
        
        initializeModeLayouts();
    }, []);

    // Just used as a flag to force the operator to rerender when the button state map
    // has been updated
    const buttonStateMap = React.useRef<ButtonStateMap>();
    function operatorCallback(bsm: ButtonStateMap) {
        let collisionButtons: ButtonPadButton[] = [];
        bsm.forEach((state, button) => {
            if (state == ButtonState.Collision) collisionButtons.push(button);
        });
        setButtonCollision(collisionButtons);
        buttonStateMap.current = bsm;
        setButtonStateMapRerender(!buttonStateMapRerender);
    }
    buttonFunctionProvider.setOperatorCallback(operatorCallback);
    
    // Set up execution state callback
    function executionStateCallback(isExecuting: boolean) {
        setIsExecutingProgram(isExecuting);
    }
    buttonFunctionProvider.setExecutionStateCallback(executionStateCallback);

    // Just used as a flag to force the operator to rerender when the tablet orientation
    // changes.
    underVideoFunctionProvider.setTabletOrientationOperatorCallback((_) => {
        setTabletOrientationRerender(!tabletOrientationRerender);
    });

    // Callback for when the move base state is updated (e.g., the ROS2 action returns)
    // Used to render alerts to the operator.
    function moveBaseStateCallback(state: ActionState) {
        setMoveBaseState(state);
    }
    underMapFunctionProvider.setOperatorCallback(moveBaseStateCallback);
    let moveBaseAlertTimeout: NodeJS.Timeout;
    React.useEffect(() => {
        if (moveBaseState && moveBaseState.alert_type != "info") {
            if (moveBaseAlertTimeout) clearTimeout(moveBaseAlertTimeout);
            moveBaseAlertTimeout = setTimeout(() => {
                setMoveBaseState(undefined);
            }, 5000);
        }
    }, [moveBaseState]);

    // Callback for when the move to pregrasp state is updated (e.g., the ROS2 action returns)
    // Used to render alerts to the operator.
    function moveToPregraspStateCallback(state: ActionState) {
        setMoveToPregraspState(state);
    }
    underVideoFunctionProvider.setMoveToPregraspOperatorCallback(
        moveToPregraspStateCallback
    );
    let moveToPregraspAlertTimeout: NodeJS.Timeout;
    React.useEffect(() => {
        if (moveToPregraspState && moveToPregraspState.alert_type != "info") {
            if (moveToPregraspAlertTimeout)
                clearTimeout(moveToPregraspAlertTimeout);
            moveToPregraspAlertTimeout = setTimeout(() => {
                setMoveToPregraspState(undefined);
            }, 5000);
        }
    }, [moveToPregraspState]);

    // Callback for when the show tablet state is updated (e.g., the ROS2 action returns)
    // Used to render alerts to the operator.
    function showTabletStateCallback(state: ActionState) {
        setShowTabletState(state);
    }
    underVideoFunctionProvider.setShowTabletOperatorCallback(
        showTabletStateCallback
    );
    let showTabletAlertTimeout: NodeJS.Timeout;
    React.useEffect(() => {
        if (showTabletState && showTabletState.alert_type != "info") {
            if (showTabletAlertTimeout) clearTimeout(showTabletAlertTimeout);
            showTabletAlertTimeout = setTimeout(() => {
                setShowTabletState(undefined);
            }, 5000);
        }
    }, [showTabletState]);

    let remoteStreams = props.remoteStreams;

    /** Rerenders the operator */
    function updateLayout() {
        console.log("update layout");
        setButtonStateMapRerender(!buttonStateMapRerender);
        setTabletOrientationRerender(!tabletOrientationRerender);
    }

    /**
     * Updates the action mode in the layout (visually) and in the function
     * provider (functionally).
     */
    function setActionMode(actionMode: ActionMode) {
        layout.current.actionMode = actionMode;
        FunctionProvider.actionMode = actionMode;
        props.storageHandler.saveCurrentLayout(layout.current);
        updateLayout();
    }

    /**
     * Sets the movement recorder component to display or hidden.
     *
     * @param displayMovementRecorder if the movement recorder component at the
     *                             top of the operator body should be displayed
     */
    function setDisplayMovementRecorder(displayMovementRecorder: boolean) {
        layout.current.displayMovementRecorder = displayMovementRecorder;
        updateLayout();
    }

    /**
     * Sets the text-to-speech component to display or hidden.
     *
     * @param displayTextToSpeech whether the text-to-speech component should
     *    be displayed.
     */
    function setDisplayTextToSpeech(displayTextToSpeech: boolean) {
        layout.current.displayTextToSpeech = displayTextToSpeech;
        updateLayout();
    }

    /**
     * Sets the display labels property to display or hidden.
     *
     * @param displayLabels if the button text labels should be displayed
     */
    function setDisplayLabels(displayLabels: boolean) {
        layout.current.displayLabels = displayLabels;
        updateLayout();
    }

    /**
     * Sets the RosbagRecorder component to display or hidden.
     *
     * @param displayRosbagRecorder whether the RosbagRecorder component should
     *    be displayed.
     */
    function setDisplayRosbagRecorder(displayRosbagRecorder: boolean) {
        layout.current.displayRosbagRecorder = displayRosbagRecorder;
        updateLayout();
    }

    /**
     * Callback when the user clicks on a drop zone, moves the active component
     * into the drop zone
     * @param path path to the clicked drop zone
     */
    function handleDrop(path: string) {
        console.log("handleDrop", path);
        if (!selectedDefinition)
            throw Error("Active definition undefined on drop event");
        let newPath: string = path;
        if (!selectedPath) {
            // New element not already in the layout
            newPath = addToLayout(selectedDefinition, path, layout.current);
        } else {
            newPath = moveInLayout(selectedPath, path, layout.current);
        }
        setSelectedPath(newPath);
        console.log("new active path", newPath);
        updateLayout();
    }

    /**
     * Callback when a component is selected during customization
     * @param path path to the selected component
     * @param def definition of the selected component
     */
    function handleSelect(def: ComponentDefinition, path?: string) {
        console.log("selected", path);
        if (!customizing) return;

        // If reselected the same component at the same path, or the same component
        // without a path from the sidebar, then unactivate it
        const pathsMatch = selectedPath && selectedPath == path;
        const defsMatch =
            !selectedPath &&
            def.type === selectedDefinition?.type &&
            def.id === selectedDefinition?.id;
        if (pathsMatch || defsMatch) {
            setSelectedDefinition(undefined);
            setSelectedPath(undefined);
            return;
        }

        // Activate the selected component
        setSelectedDefinition(def);
        setSelectedPath(path);
    }

    /** Callback when the delete button in the sidebar is clicked */
    function handleDelete() {
        if (!selectedPath)
            throw Error("handleDelete called when selectedPath is undefined");
        removeFromLayout(selectedPath, layout.current);
        updateLayout();
        setSelectedPath(undefined);
        setSelectedDefinition(undefined);
    }

    /**
     * Callback when the customization button is clicked.
     */
    const handleToggleCustomize = () => {
        if (customizing) {
            console.log("saving layout");
            props.storageHandler.saveCurrentLayout(layout.current);
        }
        setCustomizing(!customizing);
        setSelectedDefinition(undefined);
        setSelectedPath(undefined);
    };

    /** Un-select current component when click inside of header */
    function handleClickHeader() {
        setSelectedDefinition(undefined);
        setSelectedPath(undefined);
    }

    // State for automatic human API rosbag recording
    const [humanApiRosbagCounter, setHumanApiRosbagCounter] = React.useState(1);
    const [isHumanApiRecording, setIsHumanApiRecording] = React.useState(false);
    
    // Function to start automatic human API rosbag recording
    const startHumanApiRecording = async () => {
        if (isHumanApiRecording) return;
        
        const userId = sessionStorage.getItem('studyUserId');
        if (!userId) return;
        
        try {
            const response = await fetch('/start_humanapi_rosbag', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, rosbagNumber: humanApiRosbagCounter })
            });
            
            if (response.ok) {
                setIsHumanApiRecording(true);
                console.log(`Started human API rosbag recording: ${userId}_${humanApiRosbagCounter}`);
            } else {
                console.error('Failed to start human API rosbag recording');
            }
        } catch (error) {
            console.error('Error starting human API rosbag recording:', error);
        }
    };
    
    // Function to stop automatic human API rosbag recording
    const stopHumanApiRecording = async () => {
        if (!isHumanApiRecording) return;
        
        const userId = sessionStorage.getItem('studyUserId');
        if (!userId) return;
        
        try {
            const response = await fetch('/stop_humanapi_rosbag', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, rosbagNumber: humanApiRosbagCounter })
            });
            
            if (response.ok) {
                setIsHumanApiRecording(false);
                setHumanApiRosbagCounter(prev => prev + 1);
                console.log(`Stopped human API rosbag recording: ${userId}_${humanApiRosbagCounter}`);
            } else {
                console.error('Failed to stop human API rosbag recording');
            }
        } catch (error) {
            console.error('Error stopping human API rosbag recording:', error);
        }
    };
    
    /** State passed from the operator and shared by all components */
    const sharedState: SharedState = {
        customizing: customizing,
        onSelect: handleSelect,
        remoteStreams: remoteStreams,
        selectedPath: selectedPath,
        dropZoneState: {
            onDrop: handleDrop,
            selectedDefinition: selectedDefinition,
        },
        buttonStateMap: buttonStateMap.current,
        hideLabels: !layout.current.displayLabels,
        hasBetaTeleopKit: hasBetaTeleopKit,
        stretchTool: stretchTool,
        robotNotHomed: robotNotHomed,
        // Get isExecutingProgram from the state managed by ButtonFunctionProvider
        isExecutingProgram: isExecutingProgram,
        currentExecutingLine: currentExecutingLine,
        updateCurrentExecutingLine: updateCurrentExecutingLine,
        waitingForUserConfirmation: waitingForUserConfirmation,
        handleDoneTeleoperating: handleDoneTeleoperating,
        setExecutionError: setExecutionError,
        clearExecutionError: () => {
            setExecutionError(null);
            setErrorLineNumber(null);
        },
        setErrorLineNumber: setErrorLineNumber,
        executionError: executionError,
        errorLineNumber: errorLineNumber,
        // Study data tracking functions
        trackSavedPositionAdded: trackSavedPositionAdded,
        trackExecutionAttemptStart: trackExecutionAttemptStart,
        trackExecutionAttemptEnd: trackExecutionAttemptEnd,
        trackDemonstrationRecordingStart: trackDemonstrationRecordingStart,
        trackDemonstrationRecordingEnd: trackDemonstrationRecordingEnd,
        taskKey: props.studyMode ? (props.studyMode.isPracticeRound ? 'practice_round' : `task_${props.studyMode.currentTask}`) : undefined,
        startHumanApiRecording: startHumanApiRecording,
        stopHumanApiRecording: stopHumanApiRecording,
        isProgramFinished: isProgramFinished,
        setIsProgramFinished: setIsProgramFinished,
        studyMode: props.studyMode,
    };
    

    

    /** Properties for the global options area of the sidebar */
    const globalOptionsProps: GlobalOptionsProps = {
        displayMovementRecorder: layout.current.displayMovementRecorder,
        displayTextToSpeech: layout.current.displayTextToSpeech,
        displayRosbagRecorder: layout.current.displayRosbagRecorder,
        displayLabels: layout.current.displayLabels,
        setDisplayMovementRecorder: setDisplayMovementRecorder,
        setDisplayTextToSpeech: setDisplayTextToSpeech,
        setDisplayRosbagRecorder: setDisplayRosbagRecorder,
        setDisplayLabels: setDisplayLabels,
        defaultLayouts: Object.keys(DEFAULT_LAYOUTS),
        customLayouts: props.storageHandler.getCustomLayoutNames(),
        loadLayout: (layoutName: string, dflt: boolean) => {
            layout.current = dflt
                ? props.storageHandler.loadDefaultLayout(
                      layoutName as DefaultLayoutName
                  )
                : props.storageHandler.loadCustomLayout(layoutName);
            updateLayout();
        },
        saveLayout: (layoutName: string) => {
            props.storageHandler.saveCustomLayout(layout.current, layoutName);
        },
    };

    const actionModes = Object.values(ActionMode);
    const programModes = ["Demonstrate", "Program Editor", "Execution Monitor"];

    // Function to switch layouts when program mode changes
    const switchToModeLayout = (newMode: string) => {
        const previousMode = programMode;
        
        // Save current layout for current mode
        if (modeLayouts[programMode]) {
            const updatedLayouts = { ...modeLayouts };
            updatedLayouts[programMode] = layout.current;
            setModeLayouts(updatedLayouts);
            props.storageHandler.saveCurrentLayout(layout.current, programMode);
        }
        
        // Load layout for new mode from our initialized modeLayouts
        if (modeLayouts[newMode]) {
            layout.current = modeLayouts[newMode];
        } else {
            const newModeLayout = props.storageHandler.loadCurrentLayout(newMode);
            if (newModeLayout) {
                layout.current = newModeLayout;
            } else {
                // Load default layouts for each mode
                if (newMode === "Demonstrate") {
                    layout.current = props.storageHandler.loadDefaultLayout("Basic Layout" as any);
                } else if (newMode === "Program Editor") {
                    layout.current = props.storageHandler.loadDefaultLayout("Program Editor Layout" as any);
                } else if (newMode === "Execution Monitor") {
                    layout.current = props.storageHandler.loadDefaultLayout("Execution Monitor Layout" as any);
                }
            }
        }
        
        // Track program editor session start
        if (newMode === "Program Editor" && props.studyMode) {
            const userId = sessionStorage.getItem('studyUserId');
            const currentTask = props.studyMode.currentTask;
            const taskOrder = props.studyMode.taskOrder;
            
            // Start new program editor session
            setCurrentProgramSession({
                session_start: new Date().toISOString(),
                saved_positions_added: 0
            });
            
            // Initialize task data if not exists
            if (studyData && taskOrder && !studyData.tasks[taskOrder[currentTask - 1]]) {
                setStudyData(prev => ({
                    ...prev,
                    tasks: {
                        ...prev.tasks,
                        [taskOrder[currentTask - 1]]: {
                            task_start_time: new Date().toISOString(),
                            task_end_time: null,
                            program_editor_sessions: [],
                            demonstration_recordings: [],
                            execution_attempts: []
                        }
                    }
                }));
            }
        }
        
        // Track program editor session end when switching away
        if (previousMode === "Program Editor" && newMode !== "Program Editor" && currentProgramSession.session_start) {
    
            const userId = sessionStorage.getItem('studyUserId');
            const currentTask = props.studyMode?.currentTask;
            const taskOrder = props.studyMode?.taskOrder;
            
            console.log('User ID:', userId, 'Current Task:', currentTask);
            
            if (userId && currentTask && taskOrder) {
                const taskLetter = taskOrder[currentTask - 1];
                const existingData = sessionStorage.getItem(`studyData_${userId}`);
                if (existingData) {
                    const studyData = JSON.parse(existingData);
                    
                    if (!studyData.tasks[taskLetter]) {
                        studyData.tasks[taskLetter] = {
                            task_start_time: new Date().toISOString(),
                            task_end_time: null,
                            program_editor_sessions: [],
                            demonstration_recordings: [],
                            execution_attempts: []
                        };
                    }
                    
                    const sessionData = {
                        session_start: currentProgramSession.session_start,
                        session_end: new Date().toISOString(),
                        program_content: sessionStorage.getItem('programEditorCode') || "",
                        saved_positions_added: currentProgramSession.saved_positions_added
                    };
                    
                    studyData.tasks[taskLetter].program_editor_sessions.push(sessionData);
                    sessionStorage.setItem(`studyData_${userId}`, JSON.stringify(studyData));
                    console.log('Program editor session tracked:', sessionData);
                }
            }
        }
        
        updateLayout();
    };

    return (
        <div id="operator">
            {/* Persistent banner for control mode - only show in Execution Monitor mode */}
            {programMode === "Execution Monitor" && (
                <div
                    style={{
                        width: "100%",
                        background: isExecutingProgram ? "#ff9800" : "#4caf50",
                        color: "white",
                        textAlign: "center",
                        fontWeight: "bold",
                        fontSize: "1.2em",
                        padding: "8px 0",
                        position: "relative",
                        zIndex: 1,
                        opacity: props.isReconnecting ? 0.5 : 1,
                        filter: props.isReconnecting ? "grayscale(1)" : "none",
                        pointerEvents: props.isReconnecting ? "none" : "auto"
                    }}
                >
                    {isExecutingProgram ? "Robot in control" : "You are in control"}
                </div>
            )}
            




            {/* Global controls */}
            <div id="operator-global-controls">
                <div
                    className={className("operator-pose-recorder", {
                        hideLabels: !layout.current.displayLabels,
                    })}
                    hidden={!layout.current.displayMovementRecorder}
                >
                    <MovementRecorder
                        hideLabels={!layout.current.displayLabels}
                    />
                </div>
                <div
                    className={className("operator-text-to-speech", {
                        hideLabels: !layout.current.displayLabels,
                    })}
                    hidden={!layout.current.displayTextToSpeech}
                >
                    <TextToSpeech hideLabels={!layout.current.displayLabels} />
                </div>
                <div
                    className={className("operator-rosbag-recorder", {
                        hideLabels: !layout.current.displayLabels,
                    })}
                    hidden={!layout.current.displayRosbagRecorder}
                >
                    <RosbagRecorder 
                        hideLabels={!layout.current.displayLabels} 
                        sharedState={sharedState}
                        definition={{ type: ComponentType.RosbagRecorder }}
                        path="rosbag-recorder"
                    />
                </div>
            </div>
            <div id="operator-header" onClick={handleClickHeader} style={{ display: "flex", flexDirection: "column", padding: "12px 20px" }}>
                {/* Title and User ID Row */}
                <div style={{ 
                    display: "flex", 
                    justifyContent: "center", 
                    alignItems: "center",
                    marginBottom: "5px",
                    width: "100%",
                    position: "relative"
                }}>
                    {/* User ID Display */}
                    {props.studyMode && (
                        <div style={{
                            position: "absolute",
                            left: "0",
                            display: "flex",
                            alignItems: "center",
                            fontSize: "14px",
                            color: "#495057"
                        }}>
                            <span style={{ marginRight: "6px" }}>ID:</span>
                            <span style={{ fontWeight: "bold", color: "#0d4a5c" }}>
                                {sessionStorage.getItem('studyUserId') || 'Unknown'}
                            </span>
                        </div>
                    )}
                    
                    {/* Centered Title */}
                    <span style={{
                        fontSize: "18px",
                        fontWeight: "bold",
                        color: "var(--text-color)",
                        textTransform: "capitalize"
                    }}>
                        {programMode}
                    </span>
                </div>
                
                {/* Header Controls */}
                <div style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    justifyContent: "space-between",
                    width: "100%",
                    minHeight: "40px"
                }}>
                    {/* Left side controls */}
                    <div style={{ display: "flex", alignItems: "center", flex: "0 0 auto" }}>
                        {/* Program mode dropdown */}
                        <div style={{ 
                            display: "flex", 
                            alignItems: "center",
                            height: "40px"
                        }}>
                            <style>
                                {`
                                    .header-dropdown .dropdown-button {
                                        padding-top: 0.5rem !important;
                                        padding-bottom: 0.5rem !important;
                                        height: 40px !important;
                                        display: flex !important;
                                        align-items: center !important;
                                    }
                                `}
                            </style>
                            <div className="header-dropdown">
                                <Dropdown
                                    onChange={(idx) => {
                                        const newMode = programModes[idx];
                                        setProgramMode(newMode);
                                        switchToModeLayout(newMode);
                                    }}
                                    selectedIndex={programModes.indexOf(programMode)}
                                    possibleOptions={programModes}
                                    showActive
                                    placement="bottom"
                                />
                            </div>
                        </div>
                    </div>
                    
                    {/* Center controls */}
                    <div style={{ 
                        display: "flex", 
                        alignItems: "center", 
                        justifyContent: "center",
                        flex: "1 1 auto",
                        gap: "16px"
                    }}>
                        {/* AudioControl hidden for all modes */}
                        {/* Action mode dropdown and SpeedControl centered for Demonstrate and Execution Monitor modes */}
                        {programMode !== "Program Editor" && (
                            <>
                                <div className="header-dropdown">
                                    <Dropdown
                                        onChange={(idx) => setActionMode(actionModes[idx])}
                                        selectedIndex={actionModes.indexOf(
                                            layout.current.actionMode
                                        )}
                                        possibleOptions={actionModes}
                                        showActive
                                        placement="bottom"
                                    />
                                </div>
                                <SpeedControl
                                    scale={velocityScale}
                                    onChange={(newScale: number) => {
                                        setVelocityScale(newScale);
                                        FunctionProvider.velocityScale = newScale;
                                    }}
                                />
                            </>
                        )}
                    </div>
                    
                    {/* Right side controls */}
                    <div style={{ 
                        display: "flex", 
                        alignItems: "center", 
                        flex: "0 0 auto",
                        gap: "8px"
                    }}>
                        {/* CustomizeButton hidden for all modes */}
                        {/* Home Robot Button */}
                        <button
                            onClick={() => {
                                if ((window as any).remoteRobot) {
                                    (window as any).remoteRobot.homeTheRobot();
                                } else {
                                    console.error("RemoteRobot not available");
                                }
                            }}
                            id="home-robot-button"
                            className="btn-turquoise font-white"
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "4px"
                            }}
                            title="Home the robot to its default position"
                        >
                            <HomeIcon />
                            <span>Home Robot</span>
                        </button>
                        {/* Study Proceed Button */}
                        {props.studyMode && (
                            <button
                                onClick={() => {
                                    if (props.studyMode?.isPracticeRound) {
                                        // For practice round, show task description modal
                                        setShowTaskDescription(true);
                                    } else {
                                        // For actual tasks, show completion confirmation
                                        setShowStudyConfirmation(true);
                                    }
                                }}
                                className="btn-turquoise font-white"
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "4px",
                                    backgroundColor: "#28a745",
                                    borderColor: "#28a745",
                                    height: "40px",
                                    padding: "8px 16px"
                                }}
                                title={props.studyMode?.isPracticeRound ? "Start First Task" : "Proceed to next task"}
                            >
                                <span>{props.studyMode.proceedButtonText}</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>
            {robotNotHomed && (
                <div className="operator-collision-alerts">
                    <div
                        className={className("operator-alert", {
                            fadeIn: robotNotHomed,
                            fadeOut: !robotNotHomed,
                        })}
                    >
                        <HomeTheRobot
                            hideLabels={!layout.current.displayLabels}
                        />
                    </div>
                </div>
            )}
            {
                <div className="operator-collision-alerts">
                    <div
                        className={className("operator-alert", {
                            fadeIn: buttonCollision.length > 0,
                            fadeOut: buttonCollision.length == 0,
                        })}
                    >
                        <Alert type="warning">
                            <span>
                                {buttonCollision.length > 0
                                    ? buttonCollision.join(", ") +
                                      " in collision!"
                                    : ""}
                            </span>
                        </Alert>
                    </div>
                </div>
            }
            {moveBaseState && (
                <div className="operator-collision-alerts">
                    <div
                        className={className("operator-alert", {
                            fadeIn: moveBaseState !== undefined,
                            fadeOut: moveBaseState == undefined,
                        })}
                    >
                        <Alert
                            type={moveBaseState.alert_type}
                            message={moveBaseState.state}
                        />
                    </div>
                </div>
            )}
            {moveToPregraspState && (
                <div className="operator-collision-alerts">
                    <div
                        className={className("operator-alert", {
                            fadeIn: moveToPregraspState !== undefined,
                            fadeOut: moveToPregraspState == undefined,
                        })}
                    >
                        <Alert
                            type={moveToPregraspState.alert_type}
                            message={moveToPregraspState.state}
                        />
                    </div>
                </div>
            )}
            {showTabletState && (
                <div className="operator-collision-alerts">
                    <div
                        className={className("operator-alert", {
                            fadeIn: showTabletState !== undefined,
                            fadeOut: showTabletState == undefined,
                        })}
                    >
                        <Alert
                            type={showTabletState.alert_type}
                            message={showTabletState.state}
                        />
                    </div>
                </div>
            )}
            {/* Pop-up Modal */}
            {showPopup && programMode === "Execution Monitor" && (
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
                        minWidth: 320,
                        boxShadow: "0 2px 16px rgba(0,0,0,0.2)",
                        textAlign: "center"
                    }}>
                        <div style={{ fontSize: "1.2em", marginBottom: 24 }}>
                            {pauseAndConfirmMessage || "Ready to continue? Please confirm before the robot proceeds or reset to revise."}
                        </div>
                        <div style={{ display: "flex", justifyContent: "center", gap: 16 }}>
                            <button
                                style={{
                                    backgroundColor: "#f44336",
                                    color: "white",
                                    border: "none",
                                    padding: "10px 20px",
                                    fontWeight: "bold",
                                    borderRadius: "5px",
                                    cursor: "pointer"
                                }}
                                onClick={() => {
                                    setShowPopup(false);
                                    handleReset();
                                }}
                            >
                                Reset
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
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "4px"
                                }}
                                onClick={() => {
                                    setShowPopup(false);
                                    handleConfirmAndProceed();
                                }}
                            >
                                <CheckIcon style={{ fontSize: "1em" }} />
                                Confirm and proceed
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Study Confirmation Modal */}
            {showStudyConfirmation && (
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
                        minWidth: 320,
                        maxWidth: 480,
                        boxShadow: "0 2px 16px rgba(0,0,0,0.2)",
                        textAlign: "center"
                    }}>
                        <h3 style={{ marginBottom: "16px", fontSize: "1.2em" }}>
                            Task Completion Confirmation
                        </h3>
                        {/* Small User ID display */}
                        <div style={{
                            marginBottom: "16px",
                            padding: "8px 12px",
                            backgroundColor: "#f8f9fa",
                            borderRadius: "4px",
                            border: "1px solid #e9ecef",
                            fontSize: "12px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "8px"
                        }}>
                            <span style={{ color: "#666" }}>User ID:</span>
                            <span style={{
                                fontFamily: "'Courier New', monospace",
                                fontWeight: "bold",
                                color: "#495057",
                                display: "inline-flex",
                                alignItems: "baseline",
                                gap: "6px",
                                transform: "translateY(1.5px)"
                            }}>
                                {sessionStorage.getItem('studyUserId') || 'Unknown'}
                                <span
                                    onClick={() => {
                                        const userId = sessionStorage.getItem('studyUserId');
                                        if (userId) {
                                            navigator.clipboard.writeText(userId);
                                            // Brief feedback
                                            const icon = event?.target as HTMLElement;
                                            if (icon) {
                                                const originalText = icon.textContent;
                                                icon.textContent = ' ✓';
                                                setTimeout(() => {
                                                    icon.textContent = originalText;
                                                }, 1000);
                                            }
                                        }
                                    }}
                                    style={{
                                        cursor: "pointer",
                                        fontSize: "14px",
                                        opacity: 0.7,
                                        transition: "opacity 0.2s ease",
                                        userSelect: "none"
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.opacity = "1";
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.opacity = "0.7";
                                    }}
                                    title="Copy User ID"
                                >
                                    ⎘
                                </span>
                            </span>
                        </div>
                        <div style={{ fontSize: "1.1em", marginBottom: 24, textAlign: "left" }}>
                            {/* Questionnaire Section - Wrapped around confirmation content */}
                            {props.studyMode?.taskOrder && props.studyMode?.currentTask && (
                                <div style={{
                                    marginBottom: "20px",
                                    padding: "16px",
                                    backgroundColor: "#f8f9fa",
                                    borderRadius: "6px",
                                    border: "2px solid #e9ecef"
                                }}>
                                    <p style={{ marginBottom: "16px", lineHeight: "1.5" }}>
                                        Please confirm that you have:
                                    </p>
                                    <ul style={{ 
                                        marginBottom: "20px", 
                                        paddingLeft: "20px",
                                        lineHeight: "1.6"
                                    }}>
                                        <li>Demonstrated the task (recorded demo)</li>
                                        <li>Wrote a program in Program Editor mode</li>
                                        <li>Successfully executed the program</li>
                                    </ul>
                                    
                                    <div style={{ textAlign: "center", marginTop: "16px" }}>
                                        <a 
                                            href={getQuestionnaireUrl(props.studyMode.taskOrder[props.studyMode.currentTask - 1])}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{
                                                display: "inline-block",
                                                padding: "8px 16px",
                                                background: "#0d4a5c",
                                                color: "white",
                                                textDecoration: "none",
                                                borderRadius: "4px",
                                                fontWeight: "500",
                                                fontSize: "14px",
                                                transition: "all 0.3s ease"
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.background = "#0a3a47";
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.background = "#0d4a5c";
                                            }}
                                        >
                                            📄 Complete Questionnaire
                                        </a>
                                    </div>
                                </div>
                            )}
                            
                            {/* Show confirmation content without background if no questionnaire */}
                            {(!props.studyMode?.taskOrder || !props.studyMode?.currentTask) && (
                                <>
                                    <p style={{ marginBottom: "16px", lineHeight: "1.5" }}>
                                        Please confirm that you have:
                                    </p>
                                    <ul style={{ 
                                        marginBottom: "20px", 
                                        paddingLeft: "20px",
                                        lineHeight: "1.6"
                                    }}>
                                        <li>Demonstrated the task (recorded demo)</li>
                                        <li>Wrote a program in Program Editor mode</li>
                                        <li>Successfully executed the program</li>
                                    </ul>
                                </>
                            )}
                            
                            <p style={{
                                marginBottom: "0",
                                fontSize: "14px",
                                color: "#666",
                                fontStyle: "italic"
                            }}>
                                {props.studyMode?.currentTask === 4 
                                    ? "Are you ready to end the study?" 
                                    : "Are you ready to proceed to the next task?"
                                }
                            </p>
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
                                onClick={() => {
                                    setShowStudyConfirmation(false);
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                style={{
                                    background: "#28a745",
                                    color: "white",
                                    border: "none",
                                    borderRadius: 4,
                                    padding: "8px 20px",
                                    fontWeight: "bold",
                                    fontSize: "1em",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "4px"
                                }}
                                onClick={() => {
                                    setShowStudyConfirmation(false);
                                    props.studyMode?.onProceedToNextTask();
                                    // Show task description for next task (except for Task 4 which goes to conclusion)
                                    if (props.studyMode?.currentTask < 4) {
                                        setTimeout(() => {
                                            setShowTaskDescription(true);
                                        }, 100);
                                    }
                                }}
                            >
                                <CheckIcon style={{ fontSize: "1em" }} />
                                Proceed
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Task Description Modal */}
            {showTaskDescription && (
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
                        minWidth: 320,
                        maxWidth: 600,
                        boxShadow: "0 2px 16px rgba(0,0,0,0.2)",
                        textAlign: "center"
                    }}>
                        <h3 style={{ marginBottom: "16px", fontSize: "1.2em" }}>
                            {props.studyMode?.isPracticeRound ? "Practice Round Complete" : "Task Description"}
                        </h3>
                        <div style={{ fontSize: "1.1em", marginBottom: 24, textAlign: "left" }}>
                            {props.studyMode?.isPracticeRound ? (
                                <>
                                    <p style={{ marginBottom: "16px", lineHeight: "1.5" }}>
                                        <strong>Practice Task:</strong> Pick up the cube and place it down in the same spot
                                    </p>
                                    <div style={{ 
                                        marginBottom: "20px", 
                                        padding: "16px",
                                        backgroundColor: "#f8f9fa",
                                        borderRadius: "6px",
                                        border: "2px solid #e9ecef"
                                    }}>
                                        <h4 style={{ marginBottom: "12px", color: "#495057" }}>Practice Round Summary:</h4>
                                        <ul style={{ 
                                            marginBottom: "0",
                                            paddingLeft: "20px",
                                            lineHeight: "1.6"
                                        }}>
                                            <li>You have completed the practice round.</li>
                                            <li>You are now familiar with the interface.</li>
                                        </ul>
                                    </div>
                                    <p style={{ 
                                        marginBottom: "0",
                                        fontSize: "14px",
                                        color: "#666",
                                        fontStyle: "italic"
                                    }}>
                                        Click "Start First Task" to begin.
                                    </p>
                                </>
                            ) : (
                                <>
                                    <p style={{ marginBottom: "16px", lineHeight: "1.5" }}>
                                        <strong>Task:</strong> {props.studyMode?.taskOrder && props.studyMode?.taskDefinitions ? 
                                            props.studyMode.taskDefinitions[props.studyMode.taskOrder[props.studyMode.currentTask - 1]] : 
                                            '[Task description will go here]'}
                                    </p>
                                    <div style={{ 
                                        marginBottom: "20px", 
                                        padding: "16px",
                                        backgroundColor: "#fff3cd",
                                        borderRadius: "6px",
                                        border: "1px solid #ffeaa7"
                                    }}>
                                        <h4 style={{ marginBottom: "12px", color: "#856404" }}>Instructions:</h4>
                                        <ol style={{ 
                                            marginBottom: "0",
                                            paddingLeft: "20px",
                                            lineHeight: "1.6"
                                        }}>
                                            <li>Teleoperate the robot to execute the task.</li>
                                            <li>Create your program in the Program Editor.</li>
                                            <li>Execute the program to perform the task successfully.</li>
                                        </ol>
                                    </div>
                                    <p style={{ 
                                        marginBottom: "0",
                                        fontSize: "14px",
                                        color: "#666",
                                        fontStyle: "italic"
                                    }}>
                                        Click "Ready to Start" when you're ready to begin the next task.
                                    </p>
                                </>
                            )}
                        </div>
                        <div style={{ display: "flex", justifyContent: "center", gap: 16 }}>
                            <button
                                style={{
                                    background: "#28a745",
                                    color: "white",
                                    border: "none",
                                    borderRadius: 4,
                                    padding: "8px 20px",
                                    fontWeight: "bold",
                                    fontSize: "1em",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "4px"
                                }}
                                onClick={() => {
                                    setShowTaskDescription(false);
                                    if (props.studyMode?.isPracticeRound) {
                                        props.studyMode.onProceedToNextTask();
                                    }
                                }}
                            >
                                <CheckIcon style={{ fontSize: "1em" }} />
                                {props.studyMode?.isPracticeRound ? "Start First Task" : "Ready to Start"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            <div id="operator-body">
                <LayoutArea layout={layout.current} sharedState={sharedState} />
            </div>

            <Sidebar
                hidden={!customizing}
                onDelete={handleDelete}
                updateLayout={updateLayout}
                onSelect={handleSelect}
                selectedDefinition={selectedDefinition}
                selectedPath={selectedPath}
                globalOptionsProps={globalOptionsProps}
            />
        </div>
    );
};
