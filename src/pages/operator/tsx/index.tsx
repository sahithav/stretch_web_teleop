import React from "react";
import { createRoot, Root } from "react-dom/client";
import { WebRTCConnection } from "shared/webrtcconnections";
import {
    WebRTCMessage,
    RemoteStream,
    RobotPose,
    ROSOccupancyGrid,
    StretchTool,
    delay,
    getStretchTool,
    waitUntil,
} from "shared/util";
import { RemoteRobot } from "shared/remoterobot";
import { cmd } from "shared/commands";
import { Operator } from "./Operator";
import { StudyLanding } from "../../study/tsx/StudyLanding";
import { StudyConclusion } from "../../study/tsx/StudyConclusion";
import { PracticeRoundModal } from "../../study/tsx/PracticeRoundModal";
import { DEFAULT_VELOCITY_SCALE } from "./static_components/SpeedControl";
import { StorageHandler } from "./storage_handler/StorageHandler";
import { FirebaseStorageHandler } from "./storage_handler/FirebaseStorageHandler";
import { LocalStorageHandler } from "./storage_handler/LocalStorageHandler";
import { FirebaseOptions } from "firebase/app";
import { ButtonFunctionProvider } from "./function_providers/ButtonFunctionProvider";
import { FunctionProvider } from "./function_providers/FunctionProvider";
import { PredictiveDisplayFunctionProvider } from "./function_providers/PredictiveDisplayFunctionProvider";
import { UnderVideoFunctionProvider } from "./function_providers/UnderVideoFunctionProvider";
import { MapFunctionProvider } from "./function_providers/MapFunctionProvider";
import { UnderMapFunctionProvider } from "./function_providers/UnderMapFunctionProvider";
import { MovementRecorderFunctionProvider } from "./function_providers/MovementRecorderFunctionProvider";
import { TextToSpeechFunctionProvider } from "./function_providers/TextToSpeechFunctionProvider";
import { HomeTheRobotFunctionProvider } from "./function_providers/HomeTheRobotFunctionProvider";
import { MobileOperator } from "./MobileOperator";
import { isMobile } from "react-device-detect";
import "operator/css/index.css";
import { RunStopFunctionProvider } from "./function_providers/RunStopFunctionProvider";
import { BatteryVoltageFunctionProvider } from "./function_providers/BatteryVoltageFunctionProvider";
import { waitUntilAsync } from "../../../shared/util";
import { useState, useEffect } from "react";

let allRemoteStreams: Map<string, RemoteStream> = new Map<
    string,
    RemoteStream
>();
let remoteRobot: RemoteRobot;
let connection: WebRTCConnection;
let root: Root;
export let hasBetaTeleopKit: boolean;
export let stretchTool: StretchTool;
export let occupancyGrid: ROSOccupancyGrid | undefined = undefined;
export let storageHandler: StorageHandler;
let isReconnecting = false;

// Create the function providers. These abstract the logic between the React
// components and remote robot.
export var buttonFunctionProvider = new ButtonFunctionProvider();
export var predicitiveDisplayFunctionProvider =
    new PredictiveDisplayFunctionProvider();
export var underVideoFunctionProvider = new UnderVideoFunctionProvider();
export var runStopFunctionProvider = new RunStopFunctionProvider();
export var batteryVoltageFunctionProvider =
    new BatteryVoltageFunctionProvider();
export var mapFunctionProvider: MapFunctionProvider;
export var underMapFunctionProvider: UnderMapFunctionProvider;
export var movementRecorderFunctionProvider: MovementRecorderFunctionProvider;
export var textToSpeechFunctionProvider: TextToSpeechFunctionProvider;
export var homeTheRobotFunctionProvider: HomeTheRobotFunctionProvider =
    new HomeTheRobotFunctionProvider();

// Create the WebRTC connection and connect the operator room
connection = new WebRTCConnection({
    peerRole: "operator",
    polite: true,
    onMessage: handleWebRTCMessage,
    onTrackAdded: handleRemoteTrackAdded,
    onMessageChannelOpen: configureRemoteRobot,
    onConnectionEnd: disconnectFromRobot,
});

new Promise<void>(async (resolve) => {
    let currURL = new URL(window.location.href);
    let room_name = currURL.searchParams.get("robot");
    if (
        process.env.storage === "firebase" &&
        !/^stretch-(re1|re2|se3)-\d{4}$/.test(room_name)
    ) {
        console.error(`ERROR: Invalid room ${room_name}`);
        throw new Error("Invalid room name");
    }
    await connection.configure_signaler(room_name);
    console.log("Signaler ready!");

    let connected = false;
    while (!connected) {
        connection.hangup();

        // Attempt to join robot room
        let joinedRobotRoom = await connection.addOperatorToRobotRoom();
        if (!joinedRobotRoom) {
            console.log("Operator failed to join robot room");
            await delay(500);
            continue;
        }

        // Wait for WebRTC connection to resolve, timeout after 10 seconds
        let isResolved = await waitUntil(
            () => connection.connectionState() == "connected",
            10000,
        );
        if (!isResolved) {
            console.warn("WebRTC connection could not resolve");
            await delay(500);
            continue;
        }

        // Wait for data to flow through the data channel, timeout after 10 seconds
        connected = await waitUntilAsync(
            async () => await connection.isConnected(),
            10000,
        );
        if (!connected) {
            console.warn("No data flowing through data channel");
            await delay(500);
            continue;
        }

        await delay(1000); // 1 second delay to allow data to flow through data channel
        initializeOperator();
        resolve();
    }
});

// Create root once when index is loaded
const container = document.getElementById("root");
root = createRoot(container!);

/** Handle when the WebRTC connection adds a new track on a camera video stream. */
function handleRemoteTrackAdded(event: RTCTrackEvent) {
    const track = event.track;
    const stream = event.streams[0];
    let streamName = connection.cameraInfo[stream.id];
    console.log("Adding remote track", streamName);
    if (streamName != "audio") {
        console.log(stream.getVideoTracks()[0].getConstraints());
    }
    console.log("got track id=" + track.id, track);
    if (stream) {
        console.log("stream id=" + stream.id, stream);
    }
    console.log("OPERATOR: adding remote tracks");

    allRemoteStreams.set(streamName, { track: track, stream: stream });
}

/**
 * Callback to handle a new WebRTC message from the robot browser.
 * @param message the {@link WebRTCMessage} or an array of messages.
 */
function handleWebRTCMessage(message: WebRTCMessage | WebRTCMessage[]) {
    if (message instanceof Array) {
        for (const subMessage of message) {
            // Recursive call to handle each message in the array
            handleWebRTCMessage(subMessage);
        }
        return;
    }

    switch (message.type) {
        case "validJointState":
            remoteRobot.sensors.checkValidJointState(
                message.robotPose,
                message.jointsInLimits,
                message.jointsInCollision,
            );
            break;
        case "mode":
            remoteRobot.sensors.setMode(message.value);
            break;
        case "isHomed":
            remoteRobot.sensors.setIsHomed(message.value);
            break;
        case "isRunStopped":
            remoteRobot.sensors.setRunStopState(message.enabled);
            break;
        case "hasBetaTeleopKit":
            hasBetaTeleopKit = message.value;
            break;
        case "stretchTool":
            console.log("index stretchTool", message.value);
            stretchTool = getStretchTool(message.value);
            break;
        case "occupancyGrid":
            if (!occupancyGrid) {
                occupancyGrid = message.message;
            } else {
                occupancyGrid.data = occupancyGrid.data.concat(
                    message.message.data,
                );
            }
            break;
        case "amclPose":
            remoteRobot.setMapPose(message.message);
            break;
        case "goalStatus":
            console.log("goalStatus", message.message);
            remoteRobot.setGoalReached(true);
            break;
        case "moveBaseState":
            console.log("moveBaseState", message.message);
            underMapFunctionProvider.setMoveBaseState(message.message);
            break;
        case "moveToPregraspState":
            console.log("moveToPregraspState", message.message);
            underVideoFunctionProvider.setMoveToPregraspState(message.message);
            break;
        case "showTabletState":
            console.log("showTabletState", message.message);
            underVideoFunctionProvider.setShowTabletState(message.message);
            break;
        case "relativePose":
            remoteRobot.setRelativePose(message.message);
            break;
        case "batteryVoltage":
            remoteRobot.sensors.setBatteryVoltage(message.message);
            break;
        default:
            throw Error(`unhandled WebRTC message type ${message.type}`);
    }
}

/**
 * Sets up remote robot, creates the storage handler,
 * and renders the operator browser.
 */
function initializeOperator() {
    // configureRemoteRobot();
    const storageHandlerReadyCallback = () => {
        underMapFunctionProvider = new UnderMapFunctionProvider(storageHandler);
        movementRecorderFunctionProvider = new MovementRecorderFunctionProvider(
            storageHandler,
        );
        textToSpeechFunctionProvider = new TextToSpeechFunctionProvider(
            storageHandler,
        );
        renderOperator(storageHandler);
    };
    storageHandler = createStorageHandler(storageHandlerReadyCallback);
}

/**
 * Configures the remote robot, which connects with the robot browser over the
 * WebRTC connection.
 */
function configureRemoteRobot() {
    remoteRobot = new RemoteRobot({
        robotChannel: (message: cmd) => {
            connection.sendData(message);
        },
    });
    occupancyGrid = undefined;
    remoteRobot.getHasBetaTeleopKit("getHasBetaTeleopKit");
    remoteRobot.getStretchTool("getStretchTool");
    FunctionProvider.addRemoteRobot(remoteRobot);
    mapFunctionProvider = new MapFunctionProvider();
    remoteRobot.sensors.setFunctionProviderCallback(
        buttonFunctionProvider.updateJointStates,
    );
    remoteRobot.sensors.setJointStateFunctionProviderCallback(
        underVideoFunctionProvider.jointStateCallback,
    );
    remoteRobot.sensors.setBatteryFunctionProviderCallback(
        batteryVoltageFunctionProvider.updateVoltage,
    );
    remoteRobot.sensors.setModeFunctionProviderCallback(
        homeTheRobotFunctionProvider.updateModeState,
    );
    remoteRobot.sensors.setIsHomedFunctionProviderCallback(
        homeTheRobotFunctionProvider.updateIsHomedState,
    );
    remoteRobot.sensors.setRunStopFunctionProviderCallback(
        runStopFunctionProvider.updateRunStopState,
    );
    
    (window as any).remoteRobot = remoteRobot; //Make remotRobot globally available
    (window as any).buttonFunctionProvider = buttonFunctionProvider; //Make buttonFunctionProvider globally available 
}

/**
 * Creates a storage handler based on the `storage` property in the process
 * environment.
 * @param storageHandlerReadyCallback callback when the storage handler is ready
 * @returns the storage handler
 */
function createStorageHandler(storageHandlerReadyCallback: () => void) {
    switch (process.env.storage) {
        case "firebase":
            const config: FirebaseOptions = {
                apiKey: process.env.apiKey,
                authDomain: process.env.authDomain,
                projectId: process.env.projectId,
                storageBucket: process.env.storageBucket,
                messagingSenderId: process.env.messagingSenderId,
                appId: process.env.appId,
                measurementId: process.env.measurementId,
            };
            return new FirebaseStorageHandler(
                storageHandlerReadyCallback,
                config,
            );
        default:
            return new LocalStorageHandler(storageHandlerReadyCallback);
    }
}

/**
 * Renders the operator browser with study workflow.
 *
 * @param storageHandler the storage handler
 */
function renderOperator(storageHandler: StorageHandler) {
    const layout = storageHandler.loadCurrentLayoutOrDefault();
    FunctionProvider.initialize(DEFAULT_VELOCITY_SCALE, layout.actionMode);

    // Add a React state for isReconnecting and study state
    function OperatorWithStudy() {
        const [reconnecting, setReconnecting] = useState(false);
        const [studyPhase, setStudyPhase] = useState<'landing' | 'practice' | 'operator' | 'conclusion'>('landing');
        const [currentTask, setCurrentTask] = useState(1);
        const [isPracticeRound, setIsPracticeRound] = useState(false);
        const [taskOrder, setTaskOrder] = useState<string[]>([]);
        
        // Task definitions with their descriptions
        const taskDefinitions = {
            'R': 'Pick up the pill bottle and place on the box',
            'B': 'Pick up the pill bottle and place on the table', 
            'O': 'Pour the substance in cup A into cup B',
            'M': 'Pour the substance in cup A into cup B'
        };
        
        // Function to generate random task order
        const generateRandomTaskOrder = () => {
            const tasks = ['R', 'B', 'O', 'M'];
            const shuffled = [...tasks].sort(() => Math.random() - 0.5);
            return shuffled;
        };

        useEffect(() => {
            // Observe the DOM for the loader
            const observer = new MutationObserver(() => {
                const loader = document.querySelector('.loader');
                setReconnecting(!!loader);
            });
            observer.observe(document.body, { childList: true, subtree: true });
            // Initial check
            setReconnecting(!!document.querySelector('.loader'));
            return () => observer.disconnect();
        }, []);

        // Clear session storage when starting a new task
        const clearSessionStorage = () => {
            // Preserve user ID and study data
            const userId = sessionStorage.getItem('studyUserId');
            const studyDataKey = userId ? `studyData_${userId}` : 'studyData';
            const existingStudyData = sessionStorage.getItem(studyDataKey);
            const studyData = {
                currentTask: currentTask,
                studyPhase: studyPhase
            };
            sessionStorage.clear();
            // Restore preserved data
            if (userId) {
                sessionStorage.setItem('studyUserId', userId);
                if (existingStudyData) {
                    sessionStorage.setItem(studyDataKey, existingStudyData);
                }
            }
            sessionStorage.setItem('studyData', JSON.stringify(studyData));
        };

        // Handle beginning the study
        const handleBeginStudy = () => {
            setStudyPhase('practice');
        };

        const handleProceedToPractice = () => {
            clearSessionStorage();
            setStudyPhase('operator');
            setCurrentTask(1);
            setIsPracticeRound(true);
            
            // Generate random task order for the study
            const randomOrder = generateRandomTaskOrder();
            setTaskOrder(randomOrder);
            
            // Store task order in session storage
            sessionStorage.setItem('taskOrder', JSON.stringify(randomOrder));
            
            // Track study start time
            const userId = sessionStorage.getItem('studyUserId');
            if (userId) {
                const studyData = {
                    metadata: {
                        study_start_time: new Date().toISOString(),
                        study_end_time: null
                    },
                    tasks: {}
                };
                sessionStorage.setItem(`studyData_${userId}`, JSON.stringify(studyData));
            }
        };

        // Handle proceeding to next task
        const handleProceedToNextTask = () => {
            if (isPracticeRound) {
                // End practice round and start actual study
                setIsPracticeRound(false);
                setCurrentTask(1);
                clearSessionStorage();
                
                // Load or generate task order
                const savedTaskOrder = sessionStorage.getItem('taskOrder');
                if (savedTaskOrder) {
                    setTaskOrder(JSON.parse(savedTaskOrder));
                } else {
                    const randomOrder = generateRandomTaskOrder();
                    setTaskOrder(randomOrder);
                    sessionStorage.setItem('taskOrder', JSON.stringify(randomOrder));
                }
                
                // Initialize task 1 data
                const userId = sessionStorage.getItem('studyUserId');
                if (userId) {
                    const existingData = sessionStorage.getItem(`studyData_${userId}`);
                    if (existingData) {
                        const studyData = JSON.parse(existingData);
                        const taskLetter = taskOrder[0]; // First task
                        studyData.tasks[taskLetter] = {
                            task_start_time: new Date().toISOString(),
                            task_end_time: null,
                            program_editor_sessions: [],
                            demonstration_recordings: [],
                            execution_attempts: []
                        };
                        sessionStorage.setItem(`studyData_${userId}`, JSON.stringify(studyData));
                    }
                }
                
                // Update session storage with task 1
                const studyData = {
                    currentTask: 1,
                    studyPhase: 'operator'
                };
                sessionStorage.setItem('studyData', JSON.stringify(studyData));
                return;
            }
            
            // Track task end time for current task
            const userId = sessionStorage.getItem('studyUserId');
            if (userId && currentTask <= 4 && taskOrder.length > 0) {
                const taskLetter = taskOrder[currentTask - 1];
                const existingData = sessionStorage.getItem(`studyData_${userId}`);
                if (existingData) {
                    const studyData = JSON.parse(existingData);
                    if (studyData.tasks && studyData.tasks[taskLetter]) {
                        studyData.tasks[taskLetter].task_end_time = new Date().toISOString();
                        sessionStorage.setItem(`studyData_${userId}`, JSON.stringify(studyData));
                    }
                }
            }
            
            const nextTask = currentTask + 1;
            setCurrentTask(nextTask);
            
            // Clear session storage and update with new task
            clearSessionStorage();
            
            // Update session storage with the new task
            const studyData = {
                currentTask: nextTask,
                studyPhase: studyPhase
            };
            sessionStorage.setItem('studyData', JSON.stringify(studyData));
            
            // Initialize next task data (but not for task 5 which doesn't exist)
            if (nextTask <= 4 && taskOrder.length > 0) {
                const userId = sessionStorage.getItem('studyUserId');
                if (userId) {
                    const existingData = sessionStorage.getItem(`studyData_${userId}`);
                    if (existingData) {
                        const studyData = JSON.parse(existingData);
                        const taskLetter = taskOrder[nextTask - 1];
                        studyData.tasks[taskLetter] = {
                            task_start_time: new Date().toISOString(),
                            task_end_time: null,
                            program_editor_sessions: [],
                            demonstration_recordings: [],
                            execution_attempts: []
                        };
                        sessionStorage.setItem(`studyData_${userId}`, JSON.stringify(studyData));
                    }
                }
            }
            
            // Initialize task 4 data when we start task 4 (since there's no next task)
            if (nextTask === 4 && taskOrder.length > 0) {
                const userId = sessionStorage.getItem('studyUserId');
                if (userId) {
                    const existingData = sessionStorage.getItem(`studyData_${userId}`);
                    if (existingData) {
                        const studyData = JSON.parse(existingData);
                        const taskLetter = taskOrder[3]; 
                        if (!studyData.tasks[taskLetter]) {
                            studyData.tasks[taskLetter] = {
                                task_start_time: new Date().toISOString(),
                                task_end_time: null,
                                program_editor_sessions: [],
                                demonstration_recordings: [],
                                execution_attempts: []
                            };
                            sessionStorage.setItem(`studyData_${userId}`, JSON.stringify(studyData));
                        }
                    }
                }
            }
            
            if (nextTask > 4) {
                // Track study end time
                const userId = sessionStorage.getItem('studyUserId');
                if (userId) {
                    const existingData = sessionStorage.getItem(`studyData_${userId}`);
                    if (existingData) {
                        const studyData = JSON.parse(existingData);
                        studyData.metadata.study_end_time = new Date().toISOString();
                        sessionStorage.setItem(`studyData_${userId}`, JSON.stringify(studyData));
                    }
                }
                setStudyPhase('conclusion');
            }
        };

        // Get the button text based on current task
        const getProceedButtonText = () => {
            if (isPracticeRound) {
                return 'Start First Task';
            }
            
            switch (currentTask) {
                case 1: return 'Proceed to Next Task';
                case 2: return 'Proceed to Next Task';
                case 3: return 'Proceed to Next Task';
                case 4: return 'End Study';
                default: return 'Proceed';
            }
        };
        
        // Save study data when study concludes
        React.useEffect(() => {
            if (studyPhase === 'conclusion') {
        
                const userId = sessionStorage.getItem('studyUserId');
                console.log('User ID:', userId);
                
                if (userId) {
                    const studyData = sessionStorage.getItem(`studyData_${userId}`);
    
                    
                    if (studyData) {

                        fetch('/save_study_data', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                userId: userId,
                                studyData: JSON.parse(studyData)
                            })
                        }).then(response => {
                            if (response.ok) {
    
                            } else {
                                console.error('Failed to save study data');
                                response.json().then(errorData => {
                                    console.error('Error details:', errorData);
                                });
                            }
                        }).catch(error => {
                            console.error('Error saving study data:', error);
                        });
                    } else {
                        console.error('No study data found in session storage');
                    }
                } else {
                    console.error('No user ID found in session storage');
                }
            }
        }, [studyPhase]);

        // Render based on study phase
        switch (studyPhase) {
            case 'landing':
                return <StudyLanding onBeginStudy={handleBeginStudy} />;
            
            case 'practice':
                return <PracticeRoundModal onProceedToPractice={handleProceedToPractice} />;
            
            case 'operator':
                return (
                    <Operator
                        remoteStreams={allRemoteStreams}
                        layout={layout}
                        storageHandler={storageHandler}
                        isReconnecting={reconnecting}
                        studyMode={{
                            currentTask,
                            onProceedToNextTask: handleProceedToNextTask,
                            proceedButtonText: getProceedButtonText(),
                            isPracticeRound,
                            taskOrder,
                            taskDefinitions: {
                                'R': 'Pick up the pill bottle and place on the box',
                                'B': 'Pick up the pill bottle and place on the table', 
                                'O': 'Pour the substance in cup A into cup B',
                                'M': 'Pour the substance in cup A into cup B'
                            }
                        }}
                    />
                );
            
            case 'conclusion':
                return <StudyConclusion />;
            
            default:
                return <StudyLanding onBeginStudy={handleBeginStudy} />;
        }
    }

    !isMobile
        ? root.render(<OperatorWithStudy />)
        : root.render(
              <MobileOperator
                  remoteStreams={allRemoteStreams}
                  storageHandler={storageHandler}
              />,
          );

    if (!isMobile) {
        var loader = document.createElement("div");
        loader.className = "loader";
        var loaderText = document.createElement("div");
        loaderText.className = "reconnecting-text";
        var text = document.createElement("p");
        text.textContent = "Reconnecting...";
        loaderText.appendChild(text);
        var loaderBackground = document.createElement("div");
        loaderBackground.className = "loader-background";

        setInterval(async () => {
            let connected = await connection.isConnected();
            if (!connected && !window.document.body.contains(loader)) {
                window.document.body.appendChild(loaderBackground);
                window.document.body.appendChild(loaderText);
                window.document.body.appendChild(loader);
            } else if (connected && window.document.body.contains(loader)) {
                window.document.body.removeChild(loaderBackground);
                window.document.body.removeChild(loaderText);
                window.document.body.removeChild(loader);
            }
        }, 1000);
    }
}

function disconnectFromRobot() {
    connection.hangup();
    connection.stop();
}

window.onbeforeunload = () => {
    connection.hangup();
    connection.stop();
};

window.onunload = () => {
    connection.hangup();
    connection.stop();
};
