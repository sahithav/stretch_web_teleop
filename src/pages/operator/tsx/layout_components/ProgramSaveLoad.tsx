import React, { useState, useEffect } from "react";
import { SavedProgram } from "../storage_handler/StorageHandler";
import { StorageHandler } from "../storage_handler/StorageHandler";
import SaveIcon from "@mui/icons-material/Save";
import DeleteIcon from "@mui/icons-material/Delete";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";

interface ProgramSaveLoadProps {
    /** The current program code */
    code: string;
    /** The storage handler for saving/loading programs */
    storageHandler: StorageHandler;
    /** Callback when a program is loaded */
    onProgramLoad: (program: SavedProgram) => void;
    /** Callback to get current saved positions from Library component */
    getCurrentSavedPositions: () => Array<{
        name: string;
        jointStates: string;
        timestamp: Date;
    }>;
}

/**
 * Component for saving and loading programs with their associated saved positions
 */
export const ProgramSaveLoad: React.FC<ProgramSaveLoadProps> = ({
    code,
    storageHandler,
    onProgramLoad,
    getCurrentSavedPositions
}) => {
    const [savedProgramNames, setSavedProgramNames] = useState<string[]>([]);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [showLoadDropdown, setShowLoadDropdown] = useState(false);
    const [newProgramName, setNewProgramName] = useState("");
    const [programDescription, setProgramDescription] = useState("");
    const [isSmallScreen, setIsSmallScreen] = useState(window.innerWidth < 1200);

    // Update screen size on resize
    useEffect(() => {
        const handleResize = () => setIsSmallScreen(window.innerWidth < 1200);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Load saved program names
    useEffect(() => {
        try {
            const names = storageHandler.getSavedProgramNames();
            setSavedProgramNames(names);
        } catch (error) {
            console.error("Error loading saved program names:", error);
        }
    }, [storageHandler]);
    
    // Listen for trigger save program event
    useEffect(() => {
        const handleTriggerSave = () => {
            setShowSaveModal(true);
        };
        
        window.addEventListener('triggerSaveProgram', handleTriggerSave);
        
        return () => {
            window.removeEventListener('triggerSaveProgram', handleTriggerSave);
        };
    }, []);
    
    // Listen for saved positions updates to refresh the list
    useEffect(() => {
        const handleSavedPositionsUpdated = () => {
            // Refresh the saved program names when positions are updated
            try {
                const names = storageHandler.getSavedProgramNames();
                setSavedProgramNames(names);
            } catch (error) {
                console.error("Error refreshing saved program names:", error);
            }
        };
        
        window.addEventListener('savedPositionsUpdated', handleSavedPositionsUpdated);
        
        return () => {
            window.removeEventListener('savedPositionsUpdated', handleSavedPositionsUpdated);
        };
    }, [storageHandler]);

    // Handle saving a new program
    const handleSaveProgram = () => {
        if (!newProgramName.trim()) return;

        try {
            // Get saved positions from session storage
            let currentSavedPositions: Array<{
                name: string;
                jointStates: string;
                timestamp: Date;
            }> = [];
            
            const sessionPositions = sessionStorage.getItem('librarySavedPositions');
            if (sessionPositions) {
                try {
                    const parsed = JSON.parse(sessionPositions);
                    currentSavedPositions = parsed.map((pos: any) => ({
                        ...pos,
                        timestamp: new Date(pos.timestamp)
                    }));
                    console.log("Got saved positions from session storage:", currentSavedPositions);
                } catch (error) {
                    console.error("Error parsing saved positions from session storage:", error);
                }
            }
            
            console.log("Saving program with saved positions:", currentSavedPositions);
            
            // Extract saved position names used in the code
            const usedPositions = currentSavedPositions.filter(pos => 
                code.includes(pos.name)
            ).map(pos => pos.name);
            console.log("Used positions in code:", usedPositions);

            const program: SavedProgram = {
                code: code,
                savedPositions: usedPositions,
                savedPositionData: currentSavedPositions,
                timestamp: new Date(),
                description: programDescription.trim() || undefined
            };
            console.log("Saving program:", program);

            storageHandler.saveProgram(newProgramName.trim(), program);
            
            // Update the list of saved programs
            setSavedProgramNames(storageHandler.getSavedProgramNames());
            
            // Reset form
            setNewProgramName("");
            setProgramDescription("");
            setShowSaveModal(false);
        } catch (error) {
            console.error("Error saving program:", error);
            alert("Failed to save program. Please try again.");
        }
    };

    // Handle loading a program
    const handleLoadProgram = (programName: string) => {
        try {
            const program = storageHandler.getSavedProgram(programName);
            onProgramLoad(program);
            setShowLoadDropdown(false);
        } catch (error) {
            console.error("Error loading program:", error);
            alert("Failed to load program. Please try again.");
        }
    };

    // Handle deleting a program
    const handleDeleteProgram = (programName: string, event: React.MouseEvent) => {
        event.stopPropagation();
        if (confirm(`Are you sure you want to delete the program "${programName}"?`)) {
            try {
                storageHandler.deleteProgram(programName);
                setSavedProgramNames(storageHandler.getSavedProgramNames());
            } catch (error) {
                console.error("Error deleting program:", error);
                alert("Failed to delete program. Please try again.");
            }
        }
    };

    return (
        <div className="program-save-load-container" style={{
            display: "flex",
            alignItems: "center",
            gap: isSmallScreen ? "8px" : "12px"
        }}>
            {/* Load Program Dropdown */}
            {savedProgramNames.length > 0 && (
                <div className="load-program-container" style={{ position: "relative" }}>
                    <button
                        className="load-program-button"
                        onClick={() => setShowLoadDropdown(!showLoadDropdown)}
                        style={{
                            background: "#007bff",
                            color: "white",
                            border: "none",
                            borderRadius: 4,
                            padding: isSmallScreen ? "6px 12px" : "8px 16px",
                            fontSize: isSmallScreen ? "12px" : "14px",
                            fontWeight: "600",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            transition: "background-color 0.2s ease"
                        }}
                        title="Load a saved program"
                    >
                        Load Program
                        <KeyboardArrowDownIcon style={{ fontSize: isSmallScreen ? "14px" : "16px" }} />
                    </button>

                    {showLoadDropdown && (
                        <div className="load-program-dropdown" style={{
                            position: "absolute",
                            top: "100%",
                            left: 0,
                            right: 0,
                            background: "white",
                            border: "1px solid #ccc",
                            borderRadius: 4,
                            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                            zIndex: 1000,
                            maxHeight: "200px",
                            overflowY: "auto",
                            marginTop: "4px"
                        }}>
                            {savedProgramNames.map((programName, index) => (
                                <div
                                    key={index}
                                    className="load-program-item"
                                    onClick={() => handleLoadProgram(programName)}
                                    style={{
                                        padding: isSmallScreen ? "8px 12px" : "10px 16px",
                                        cursor: "pointer",
                                        borderBottom: index < savedProgramNames.length - 1 ? "1px solid #eee" : "none",
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        fontSize: isSmallScreen ? "12px" : "14px"
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = "#f8f9fa";
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = "white";
                                    }}
                                >
                                    <span style={{ flex: 1 }}>{programName}</span>
                                    <button
                                        onClick={(e) => handleDeleteProgram(programName, e)}
                                        style={{
                                            background: "none",
                                            border: "none",
                                            color: "#dc3545",
                                            cursor: "pointer",
                                            padding: "2px",
                                            borderRadius: "2px",
                                            display: "flex",
                                            alignItems: "center"
                                        }}
                                        title="Delete program"
                                    >
                                        <DeleteIcon style={{ fontSize: isSmallScreen ? "14px" : "16px" }} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Save Program Modal */}
            {showSaveModal && (
                <div style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    width: "100vw",
                    height: "100vh",
                    background: "rgba(0,0,0,0.5)",
                    zIndex: 1000,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                }}>
                    <div style={{
                        background: "white",
                        borderRadius: 8,
                        padding: isSmallScreen ? "24px" : "32px",
                        minWidth: isSmallScreen ? "300px" : "400px",
                        maxWidth: "500px",
                        boxShadow: "0 4px 20px rgba(0,0,0,0.3)"
                    }}>
                        <h3 style={{
                            margin: "0 0 20px 0",
                            fontSize: isSmallScreen ? "18px" : "20px",
                            fontWeight: "600"
                        }}>
                            Save Program
                        </h3>
                        
                        <div style={{ marginBottom: "16px" }}>
                            <label style={{
                                display: "block",
                                marginBottom: "6px",
                                fontWeight: "600",
                                fontSize: isSmallScreen ? "13px" : "14px"
                            }}>
                                Program Name *
                            </label>
                            <input
                                type="text"
                                value={newProgramName}
                                onChange={(e) => setNewProgramName(e.target.value)}
                                placeholder="Enter program name..."
                                style={{
                                    width: "100%",
                                    padding: "8px 12px",
                                    border: "1px solid #ccc",
                                    borderRadius: 4,
                                    fontSize: isSmallScreen ? "13px" : "14px"
                                }}
                                autoFocus
                            />
                        </div>

                        <div style={{ marginBottom: "20px" }}>
                            <label style={{
                                display: "block",
                                marginBottom: "6px",
                                fontWeight: "600",
                                fontSize: isSmallScreen ? "13px" : "14px"
                            }}>
                                Description (Optional)
                            </label>
                            <textarea
                                value={programDescription}
                                onChange={(e) => setProgramDescription(e.target.value)}
                                placeholder="Enter program description..."
                                style={{
                                    width: "100%",
                                    padding: "8px 12px",
                                    border: "1px solid #ccc",
                                    borderRadius: 4,
                                    fontSize: isSmallScreen ? "13px" : "14px",
                                    minHeight: "60px",
                                    resize: "vertical"
                                }}
                            />
                        </div>

                        <div style={{
                            display: "flex",
                            justifyContent: "flex-end",
                            gap: "12px"
                        }}>
                            <button
                                onClick={() => {
                                    setShowSaveModal(false);
                                    setNewProgramName("");
                                    setProgramDescription("");
                                }}
                                style={{
                                    background: "#6c757d",
                                    color: "white",
                                    border: "none",
                                    borderRadius: 4,
                                    padding: isSmallScreen ? "8px 16px" : "10px 20px",
                                    fontSize: isSmallScreen ? "13px" : "14px",
                                    cursor: "pointer"
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveProgram}
                                disabled={!newProgramName.trim()}
                                style={{
                                    background: newProgramName.trim() ? "#28a745" : "#6c757d",
                                    color: "white",
                                    border: "none",
                                    borderRadius: 4,
                                    padding: isSmallScreen ? "8px 16px" : "10px 20px",
                                    fontSize: isSmallScreen ? "13px" : "14px",
                                    cursor: newProgramName.trim() ? "pointer" : "not-allowed"
                                }}
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Click outside to close dropdown */}
            {showLoadDropdown && (
                <div
                    style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        width: "100vw",
                        height: "100vh",
                        zIndex: 999
                    }}
                    onClick={() => setShowLoadDropdown(false)}
                />
            )}
        </div>
    );
};
