import { StorageHandler, SavedProgram } from "./StorageHandler";
import { LayoutDefinition } from "../utils/component_definitions";
import { ArucoMarkersInfo, RobotPose } from "shared/util";
import ROSLIB from "roslib";

/** Uses browser local storage to store data. */
export class LocalStorageHandler extends StorageHandler {
    public static CURRENT_LAYOUT_KEY = "user_custom_layout";
    public static LAYOUT_NAMES_KEY = "user_custom_layout_names";
    public static POSE_NAMES_KEY = "user_pose_names";
    public static MAP_POSE_NAMES_KEY = "user_map_pose_names";
    public static MAP_POSE_TYPES_KEY = "user_map_pose_types";
    public static POSE_RECORDING_NAMES_KEY = "user_pose_recording_names";
    public static TEXT_TO_SPEECH_KEY = "text_to_speech";
    public static SAVED_PROGRAM_NAMES_KEY = "user_saved_program_names";
    public static SAVED_POSITION_NAMES_KEY = "user_saved_position_names";

    constructor(onStorageHandlerReadyCallback: () => void) {
        super(onStorageHandlerReadyCallback);
        // Allow the initialization process to complete before invoking the callback
        setTimeout(() => {
            this.getCustomLayoutNames();
            this.onReadyCallback();
        }, 0);
    }

    public loadCustomLayout(layoutName: string): LayoutDefinition {
        const storedJson = localStorage.getItem(layoutName);
        if (!storedJson)
            throw Error(`Could not load custom layout ${layoutName}`);
        return JSON.parse(storedJson);
    }

    public saveCustomLayout(
        layout: LayoutDefinition,
        layoutName: string,
    ): void {
        const layoutNames = this.getCustomLayoutNames();
        layoutNames.push(layoutName);
        localStorage.setItem(
            LocalStorageHandler.LAYOUT_NAMES_KEY,
            JSON.stringify(layoutNames),
        );
        localStorage.setItem(layoutName, JSON.stringify(layout));
    }

    public saveCurrentLayout(layout: LayoutDefinition, mode?: string): void {
        const key = mode ? `${LocalStorageHandler.CURRENT_LAYOUT_KEY}_${mode}` : LocalStorageHandler.CURRENT_LAYOUT_KEY;
        localStorage.setItem(key, JSON.stringify(layout));
    }

    public loadCurrentLayout(mode?: string): LayoutDefinition | null {
        const key = mode ? `${LocalStorageHandler.CURRENT_LAYOUT_KEY}_${mode}` : LocalStorageHandler.CURRENT_LAYOUT_KEY;
        const storedJson = localStorage.getItem(key);
        if (!storedJson) return null;
        return JSON.parse(storedJson);
    }

    public getCustomLayoutNames(): string[] {
        const storedJson = localStorage.getItem(
            LocalStorageHandler.LAYOUT_NAMES_KEY,
        );
        if (!storedJson) return [];
        return JSON.parse(storedJson);
    }

    public saveMapPose(
        poseName: string,
        pose: ROSLIB.Transform,
        poseType: string,
    ) {
        const poseNames = this.getMapPoseNames();
        const poseTypes = this.getMapPoseTypes();
        // If pose name does not exist add the name, type and pose, otherwise replace the
        // type and pose for the given name
        if (!poseNames.includes(poseName)) {
            poseNames.push(poseName);
            poseTypes.push(poseType);
        } else {
            let idx = poseNames.indexOf(poseName);
            poseTypes[idx] = poseType;
        }
        localStorage.setItem(
            LocalStorageHandler.MAP_POSE_NAMES_KEY,
            JSON.stringify(poseNames),
        );
        localStorage.setItem(
            LocalStorageHandler.MAP_POSE_TYPES_KEY,
            JSON.stringify(poseTypes),
        );
        localStorage.setItem("map_" + poseName, JSON.stringify(pose));
    }

    public getMapPoseNames(): string[] {
        const storedJson = localStorage.getItem(
            LocalStorageHandler.MAP_POSE_NAMES_KEY,
        );
        if (!storedJson) return [];
        return JSON.parse(storedJson);
    }

    public getMapPose(poseName: string): ROSLIB.Transform {
        const storedJson = localStorage.getItem("map_" + poseName);
        if (!storedJson) throw Error(`Could not load pose ${poseName}`);
        return JSON.parse(storedJson);
    }

    public getMapPoses(): ROSLIB.Transform[] {
        const poseNames = this.getMapPoseNames();
        var poses: ROSLIB.Transform[] = [];
        poseNames.forEach((poseName) => {
            const pose = this.getMapPose(poseName);
            poses.push(pose);
        });
        return poses;
    }

    public getMapPoseTypes(): string[] {
        const storedJson = localStorage.getItem(
            LocalStorageHandler.MAP_POSE_TYPES_KEY,
        );
        if (!storedJson) return [];
        return JSON.parse(storedJson);
    }

    public deleteMapPose(poseName: string): void {
        const poseNames = this.getMapPoseNames();
        if (!poseNames.includes(poseName)) return;
        localStorage.removeItem("map_" + poseName);
        const index = poseNames.indexOf(poseName);
        poseNames.splice(index, 1);
        const poseTypes = this.getMapPoseTypes();
        poseTypes.splice(index, 1);
        localStorage.setItem(
            LocalStorageHandler.MAP_POSE_NAMES_KEY,
            JSON.stringify(poseNames),
        );
        localStorage.setItem(
            LocalStorageHandler.MAP_POSE_TYPES_KEY,
            JSON.stringify(poseTypes),
        );
    }

    public getRecordingNames(): string[] {
        const storedJson = localStorage.getItem(
            LocalStorageHandler.POSE_RECORDING_NAMES_KEY,
        );
        if (!storedJson) return [];
        return JSON.parse(storedJson);
    }

    public getRecording(recordingName: string): RobotPose[] {
        const storedJson = localStorage.getItem("recording_" + recordingName);
        if (!storedJson)
            throw Error(`Could not load recording ${recordingName}`);
        return JSON.parse(storedJson);
    }

    public savePoseRecording(recordingName: string, poses: RobotPose[]): void {
        const recordingNames = this.getRecordingNames();
        if (!recordingNames.includes(recordingName))
            recordingNames.push(recordingName);
        localStorage.setItem(
            LocalStorageHandler.POSE_RECORDING_NAMES_KEY,
            JSON.stringify(recordingNames),
        );
        localStorage.setItem(
            "recording_" + recordingName,
            JSON.stringify(poses),
        );
    }

    public deleteRecording(recordingName: string): void {
        const recordingNames = this.getRecordingNames();
        if (!recordingNames.includes(recordingName)) return;
        localStorage.removeItem("recording_" + recordingName);
        const index = recordingNames.indexOf(recordingName);
        recordingNames.splice(index, 1);
        localStorage.setItem(
            LocalStorageHandler.POSE_RECORDING_NAMES_KEY,
            JSON.stringify(recordingNames),
        );
    }

    public getSavedTexts(): string[] {
        const storedJson = localStorage.getItem(
            LocalStorageHandler.TEXT_TO_SPEECH_KEY,
        );
        if (!storedJson) return [];
        return JSON.parse(storedJson);
    }

    public saveText(text: string): void {
        const texts = this.getSavedTexts();
        if (texts.includes(text)) return;
        texts.push(text);
        localStorage.setItem(
            LocalStorageHandler.TEXT_TO_SPEECH_KEY,
            JSON.stringify(texts),
        );
    }

    public deleteText(text: string): void {
        const texts = this.getSavedTexts();
        if (!texts.includes(text)) return;
        const index = texts.indexOf(text);
        texts.splice(index, 1);
        localStorage.setItem(
            LocalStorageHandler.TEXT_TO_SPEECH_KEY,
            JSON.stringify(texts),
        );
    }

    public getSavedProgramNames(): string[] {
        const storedJson = localStorage.getItem(
            LocalStorageHandler.SAVED_PROGRAM_NAMES_KEY,
        );
        if (!storedJson) return [];
        return JSON.parse(storedJson);
    }

    public getSavedProgram(programName: string): SavedProgram {
        const storedJson = localStorage.getItem("program_" + programName);
        if (!storedJson)
            throw Error(`Could not load program ${programName}`);
        const program = JSON.parse(storedJson);
        // Convert timestamp back to Date object
        program.timestamp = new Date(program.timestamp);
        program.savedPositionData = program.savedPositionData.map((pos: any) => ({
            ...pos,
            timestamp: new Date(pos.timestamp)
        }));
        return program;
    }

    public saveProgram(programName: string, program: SavedProgram): void {
        const programNames = this.getSavedProgramNames();
        if (!programNames.includes(programName))
            programNames.push(programName);
        localStorage.setItem(
            LocalStorageHandler.SAVED_PROGRAM_NAMES_KEY,
            JSON.stringify(programNames),
        );
        localStorage.setItem(
            "program_" + programName,
            JSON.stringify(program),
        );
    }

    public deleteProgram(programName: string): void {
        const programNames = this.getSavedProgramNames();
        if (!programNames.includes(programName)) return;
        localStorage.removeItem("program_" + programName);
        const index = programNames.indexOf(programName);
        programNames.splice(index, 1);
        localStorage.setItem(
            LocalStorageHandler.SAVED_PROGRAM_NAMES_KEY,
            JSON.stringify(programNames),
        );
    }

    public getSavedPositionNames(): string[] {
        const storedJson = localStorage.getItem(
            LocalStorageHandler.SAVED_POSITION_NAMES_KEY,
        );
        if (!storedJson) return [];
        return JSON.parse(storedJson);
    }

    public getSavedPosition(positionName: string): {
        name: string;
        jointStates: string;
        timestamp: Date;
    } {
        const storedJson = localStorage.getItem("position_" + positionName);
        if (!storedJson)
            throw Error(`Could not load position ${positionName}`);
        const position = JSON.parse(storedJson);
        // Convert timestamp back to Date object
        position.timestamp = new Date(position.timestamp);
        return position;
    }

    public savePosition(positionName: string, position: {
        name: string;
        jointStates: string;
        timestamp: Date;
    }): void {
        const positionNames = this.getSavedPositionNames();
        if (!positionNames.includes(positionName))
            positionNames.push(positionName);
        localStorage.setItem(
            LocalStorageHandler.SAVED_POSITION_NAMES_KEY,
            JSON.stringify(positionNames),
        );
        localStorage.setItem(
            "position_" + positionName,
            JSON.stringify(position),
        );
    }

    public deletePosition(positionName: string): void {
        const positionNames = this.getSavedPositionNames();
        if (!positionNames.includes(positionName)) return;
        localStorage.removeItem("position_" + positionName);
        const index = positionNames.indexOf(positionName);
        positionNames.splice(index, 1);
        localStorage.setItem(
            LocalStorageHandler.SAVED_POSITION_NAMES_KEY,
            JSON.stringify(positionNames),
        );
    }
}
