<img width="1280" height="640" alt="git (1)" src="https://github.com/user-attachments/assets/8920b256-2ba8-4988-b824-5351134eb4bd" />

# Helium HUD for Google Meet 🎯

## Basic Details
### Team Name: Show Killers

### Team Members
- Team Lead: Jerry Bernard - Albertian Institute of Science and Technology

### Project Description
Helium HUD for Google Meet is a Manifest V3 Chrome Extension that monitors continuous microphone talk time in Google Meet calls, forcefully auto-mutes the user's microphone when they exceed their talk limit, and dynamically shifts their voice up to cartoon chipmunk (+12.0 semitones) levels if enabled.

### The Problem (that doesn't exist)
People who dominate Google Meet calls by speaking continuously for minutes on end without letting anyone else get a word in, ruining meetings with endless monologues.

### The Solution (that nobody asked for)
An unyielding, client-side Web Audio extension that tracks your continuous talk streak in real time, pitches your voice into a chipmunk helium voice if you talk too long, and forcefully auto-mutes your mic when you hit your limit!

## Technical Details
### Technologies/Components Used
For Software:
- Languages: JavaScript (ES6+), HTML5, CSS3
- Frameworks: Web Audio API, Chrome Extension (Manifest V3 - Main & Isolated Worlds)
- APIs: MediaStream API, AnalyserNode VAD, AudioContext, Shadow DOM
- Tools: Google Chrome Developer Mode, Git

For Hardware:
- Client-side Microphone (Built-in or USB Microphone)

### Implementation
For Software:
# Installation
```bash
git clone https://github.com/jerry53779/useless_project_gmeet_show_killer.git
```
1. Open Google Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** using the toggle in the top-right corner.
3. Click **Load unpacked** and select the cloned project directory.

# Run
1. Join or host any call at [https://meet.google.com](https://meet.google.com).
2. The **Helium HUD** overlay will automatically float into the bottom-left corner of the call viewport.
3. Unmute your mic and speak. Click **⏱ 10s Test** on the HUD to verify mandatory auto-mute and helium pitch escalation!

### Project Documentation
For Software:

# Screenshots
![Helium HUD Overlay](https://github.com/user-attachments/assets/8920b256-2ba8-4988-b824-5351134eb4bd)
*Floating Glassmorphic HUD overlay active during a Google Meet call showing real-time talk streak timer, progress bar, and pitch status*

![Mandatory Auto-Mute & Chipmunk Pitch Escalation](https://github.com/user-attachments/assets/8920b256-2ba8-4988-b824-5351134eb4bd)
*Real-time voice activity monitoring with automated pitch modulation and mandatory mic auto-mute*

![Interactive Controls](https://github.com/user-attachments/assets/8920b256-2ba8-4988-b824-5351134eb4bd)
*Interactive controls for toggling Helium mode ON/OFF, resetting streak counter, and 10s test mode*

# Diagrams
```
[ Microphone Input ] 
       │
       ▼
[ inject.js (MAIN World) ] ──(Web Audio API)──► [ AnalyserNode VAD ]
       │                                               │ (RMS > 0.04)
       ▼                                               ▼
[ Dual-Delay Pitch Shifter ] ◄──(Pitch Modulation)── [ Talk Streak Escalator ]
       │                                               │
       ▼ (MediaStreamDestination)                      ▼ (window.postMessage)
[ Google Meet Call Stream ]                     [ content.js (Isolated World) ]
                                                       │
                                                       ▼
                                            [ Mandatory Auto-Mute DOM ]
                                            [ Floating Glassmorphic HUD ]
```
*Architecture Diagram: Web Audio API MAIN world interception pipeline -> RMS VAD Analysis -> Dual-Delay Pitch Shift DSP -> Isolated World Auto-Mute DOM Enforcement*

### Project Demo
# Video
[Add your demo video link here]
*Demonstrating real-time voice monitoring, chipmunk pitch shifting, and mandatory auto-mute in Google Meet*

# Additional Demos
- 10-second test mode trigger via HUD button or console `window.__HELIUM_DEBUG_MODE__ = true`

## Team Contributions
- Jerry Bernard: Complete architectural design, Web Audio DSP pipeline, MAIN execution world interception, VAD logic, mandatory auto-mute DOM enforcement, and glassmorphic HUD UI development.

---
Made with ❤️ at TinkerHub Useless Projects 

![Static Badge](https://img.shields.io/badge/TinkerHub-24?color=%23000000&link=https%3A%2F%2Fwww.tinkerhub.org%2F)
![Static Badge](https://img.shields.io/badge/UselessProjects--26-26?link=https%3A%2F%2Ftinkerhub.org%2Fevents%2F1M8ORET9A1%2Fuseless-projects-3.0)
