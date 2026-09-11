/**
 * Helium HUD for Google Meet - Injected MAIN World Script
 * Audio Interception & Real-time Pitch DSP Engine
 * Intercepts navigator.mediaDevices.getUserMedia, calculates VAD streak,
 * provides toggleable Web Audio helium pitch modulation, and emits telemetry.
 */

(function () {
  if (window.__HELIUM_VOICE_INJECTED__) {
    console.log('[Helium HUD] Script already initialized in MAIN world.');
    return;
  }
  window.__HELIUM_VOICE_INJECTED__ = true;

  console.log('[Helium HUD] MAIN world audio interception script active.');

  // Global exported debug mode flag (allows 10s talk limit testing)
  window.__HELIUM_DEBUG_MODE__ = false;

  /**
   * Dual-Delay Line Granular Pitch Shifter Node Graph
   */
  class HeliumPitchShifter {
    constructor(audioContext) {
      this.ctx = audioContext;
      this.pitchShift = 0.0;

      this.inputNode = this.ctx.createGain();
      this.outputNode = this.ctx.createGain();

      // Passthrough (Dry) Branch
      this.dryGainNode = this.ctx.createGain();
      this.dryGainNode.gain.value = 1.0;

      // Pitch Modulated (Wet) Branch
      this.wetGainNode = this.ctx.createGain();
      this.wetGainNode.gain.value = 0.0;

      this.inputNode.connect(this.dryGainNode);
      this.dryGainNode.connect(this.outputNode);

      this.setupGraph();
    }

    setupGraph() {
      const grainSize = 0.05; // 50ms grain window
      const sampleRate = this.ctx.sampleRate;
      const bufferLen = Math.floor(sampleRate * grainSize);

      this.delayA = this.ctx.createDelay(1.0);
      this.delayB = this.ctx.createDelay(1.0);

      this.gainA = this.ctx.createGain();
      this.gainB = this.ctx.createGain();

      // Sawtooth LFO Ramp Buffer [0 -> 1]
      const rampBuffer = this.ctx.createBuffer(1, bufferLen, sampleRate);
      const rampData = rampBuffer.getChannelData(0);
      for (let i = 0; i < bufferLen; i++) {
        rampData[i] = i / bufferLen;
      }

      // Triangle Window Buffer [0 -> 1 -> 0]
      const windowBuffer = this.ctx.createBuffer(1, bufferLen, sampleRate);
      const windowData = windowBuffer.getChannelData(0);
      for (let i = 0; i < bufferLen; i++) {
        const x = i / bufferLen;
        windowData[i] = 1 - 2 * Math.abs(x - 0.5);
      }

      this.rampSourceA = this.ctx.createBufferSource();
      this.rampSourceA.buffer = rampBuffer;
      this.rampSourceA.loop = true;

      this.rampSourceB = this.ctx.createBufferSource();
      this.rampSourceB.buffer = rampBuffer;
      this.rampSourceB.loop = true;

      this.winSourceA = this.ctx.createBufferSource();
      this.winSourceA.buffer = windowBuffer;
      this.winSourceA.loop = true;

      this.winSourceB = this.ctx.createBufferSource();
      this.winSourceB.buffer = windowBuffer;
      this.winSourceB.loop = true;

      this.modGainA = this.ctx.createGain();
      this.modGainB = this.ctx.createGain();
      this.modGainA.gain.value = 0.0;
      this.modGainB.gain.value = 0.0;

      this.delayA.delayTime.value = 0.01;
      this.delayB.delayTime.value = 0.01;

      this.rampSourceA.connect(this.modGainA);
      this.modGainA.connect(this.delayA.delayTime);

      this.rampSourceB.connect(this.modGainB);
      this.modGainB.connect(this.delayB.delayTime);

      this.winSourceA.connect(this.gainA.gain);
      this.winSourceB.connect(this.gainB.gain);

      this.inputNode.connect(this.delayA);
      this.delayA.connect(this.gainA);
      this.gainA.connect(this.wetGainNode);

      this.inputNode.connect(this.delayB);
      this.delayB.connect(this.gainB);
      this.gainB.connect(this.wetGainNode);

      this.wetGainNode.connect(this.outputNode);

      this.rampSourceA.start();
      this.winSourceA.start();

      const halfPeriod = grainSize / 2;
      this.rampSourceB.start(this.ctx.currentTime + halfPeriod);
      this.winSourceB.start(this.ctx.currentTime + halfPeriod);
    }

    setPitchShift(semitones) {
      if (Math.abs(this.pitchShift - semitones) < 0.05) return;
      this.pitchShift = semitones;

      const now = this.ctx.currentTime;
      if (semitones <= 0.01) {
        // Clear passthrough audio
        this.dryGainNode.gain.setTargetAtTime(1.0, now, 0.05);
        this.wetGainNode.gain.setTargetAtTime(0.0, now, 0.05);
      } else {
        // Pitch shifting active
        this.dryGainNode.gain.setTargetAtTime(0.0, now, 0.05);
        this.wetGainNode.gain.setTargetAtTime(1.0, now, 0.05);

        const ratio = Math.pow(2, semitones / 12);
        const grainSize = 0.05;
        const delayMod = grainSize * (1 - 1 / ratio);
        const speed = (ratio - 1) / grainSize;
        const playbackRate = Math.max(0.1, Math.min(10.0, Math.abs(speed)));

        this.rampSourceA.playbackRate.setValueAtTime(playbackRate, now);
        this.rampSourceB.playbackRate.setValueAtTime(playbackRate, now);
        this.winSourceA.playbackRate.setValueAtTime(playbackRate, now);
        this.winSourceB.playbackRate.setValueAtTime(playbackRate, now);

        this.modGainA.gain.setValueAtTime(delayMod, now);
        this.modGainB.gain.setValueAtTime(delayMod, now);
      }
    }
  }

  // Internal Engine State
  let engineState = {
    consecutiveTalkMs: 0,
    pitchShift: 0.0,
    isSpeaking: false,
    timerState: 'STOPPED',
    heliumEnabled: true,
    lastSilenceTime: null,
    pitchShifter: null,
    audioContext: null,
    isMeetMutedByUI: false
  };

  /**
   * Process raw hardware stream via Web Audio DSP & VAD
   */
  function processAudioStream(rawStream) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
      engineState.audioContext = audioCtx;

      const rawAudioTrack = rawStream.getAudioTracks()[0];
      const micSource = audioCtx.createMediaStreamSource(rawStream);
      const destination = audioCtx.createMediaStreamDestination();

      const pitchShifter = new HeliumPitchShifter(audioCtx);
      engineState.pitchShifter = pitchShifter;

      micSource.connect(pitchShifter.inputNode);
      pitchShifter.outputNode.connect(destination);

      // AnalyserNode for Voice Activity Detection (VAD)
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.2;
      micSource.connect(analyser);

      const pcmData = new Float32Array(analyser.frequencyBinCount);

      // Periodic VAD & Timing Loop (200ms interval)
      setInterval(() => {
        // Check if Google Meet is actively capturing sound on the audio track AND unmuted in UI
        const isCapturing =
          !engineState.isMeetMutedByUI &&
          rawAudioTrack &&
          rawAudioTrack.enabled &&
          !rawAudioTrack.muted &&
          rawAudioTrack.readyState === 'live';

        let rms = 0;
        if (isCapturing) {
          analyser.getFloatTimeDomainData(pcmData);
          let sumSquares = 0;
          for (let i = 0; i < pcmData.length; i++) {
            sumSquares += pcmData[i] * pcmData[i];
          }
          rms = Math.sqrt(sumSquares / pcmData.length);
        }

        const now = Date.now();
        const isVoicePresent = isCapturing && rms > 0.04;

        if (isVoicePresent) {
          // Unmuted AND voice detected: Timer RUNS (increments streak)
          engineState.isSpeaking = true;
          engineState.timerState = 'RUNNING';
          engineState.lastSilenceTime = null;
          engineState.consecutiveTalkMs += 200;
        } else {
          // Voice absent OR muted: Timer PAUSES (holds current streak value)
          engineState.isSpeaking = false;
          engineState.timerState = isCapturing ? 'PAUSED' : 'MUTED';

          if (!engineState.lastSilenceTime) {
            engineState.lastSilenceTime = now;
          }

          // Reset streak to 0 immediately if muted in UI, or after 3.0s continuous silence
          if (!isCapturing || now - engineState.lastSilenceTime > 3000) {
            engineState.consecutiveTalkMs = 0;
            if (!isCapturing) engineState.timerState = 'MUTED';
            else engineState.timerState = 'STOPPED';
          }
        }

        const streakSec = Math.floor(engineState.consecutiveTalkMs / 1000);
        const limitSec = window.__HELIUM_DEBUG_MODE__ ? 10 : 240;

        let targetPitch = 0.0;
        if (streakSec > limitSec) {
          if (engineState.heliumEnabled) {
            const overdueSec = streakSec - limitSec;
            targetPitch = Math.min(12.0, 0.5 + Math.floor(overdueSec / 30) * 0.5);
          } else {
            targetPitch = 0.0; // Keep pitch at 0.0 semitones when Helium mode is OFF
          }
        }

        engineState.pitchShift = targetPitch;
        if (engineState.pitchShifter) {
          engineState.pitchShifter.setPitchShift(targetPitch);
        }

        // Post telemetry updates to window every 200ms
        window.postMessage(
          {
            source: 'HELIUM_INJECT',
            type: 'HELIUM_TELEMETRY',
            detail: {
              streakSec: streakSec,
              pitchShift: parseFloat(targetPitch.toFixed(1)),
              isSpeaking: engineState.isSpeaking,
              timerState: engineState.timerState,
              heliumEnabled: engineState.heliumEnabled,
              debugMode: !!window.__HELIUM_DEBUG_MODE__,
              limitSec: limitSec
            }
          },
          '*'
        );
      }, 200);

      return destination.stream.getAudioTracks()[0];
    } catch (err) {
      console.warn('[Helium HUD] AudioContext initialization failed, falling back to raw stream:', err);
      return null; // Defensive fallback to original audio stream
    }
  }

  // Monkeypatch navigator.mediaDevices.getUserMedia
  const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(
    navigator.mediaDevices
  );

  navigator.mediaDevices.getUserMedia = async function (constraints) {
    if (!constraints || !constraints.audio) {
      return originalGetUserMedia(constraints);
    }

    let rawStream;
    try {
      rawStream = await originalGetUserMedia(constraints);
    } catch (err) {
      throw err;
    }

    try {
      const rawAudioTracks = rawStream.getAudioTracks();
      if (rawAudioTracks.length === 0) {
        return rawStream;
      }

      const processedAudioTrack = processAudioStream(rawStream);
      if (!processedAudioTrack) {
        return rawStream; // Graceful fallback
      }

      const combinedTracks = [
        processedAudioTrack,
        ...rawStream.getVideoTracks()
      ];
      const resultStream = new MediaStream(combinedTracks);

      console.log('[Helium HUD] getUserMedia intercepted successfully. DSP attached.');
      return resultStream;
    } catch (err) {
      console.warn('[Helium HUD] Interception failed, falling back to original raw stream:', err);
      return rawStream;
    }
  };

  // Listen for IPC Actions from content.js
  window.addEventListener('message', (event) => {
    if (event.data && event.data.source === 'HELIUM_CONTENT') {
      if (event.data.type === 'HELIUM_MEET_MUTE_STATE') {
        engineState.isMeetMutedByUI = !!event.data.isMeetMuted;
      } else if (event.data.type === 'HELIUM_TOGGLE') {
        engineState.heliumEnabled = !engineState.heliumEnabled;
        console.log('[Helium HUD] Helium pitch mode toggled:', engineState.heliumEnabled);
      } else if (event.data.type === 'HELIUM_RESET') {
        engineState.consecutiveTalkMs = 0;
        engineState.pitchShift = 0.0;
        if (engineState.pitchShifter) {
          engineState.pitchShifter.setPitchShift(0.0);
        }
        console.log('[Helium HUD] Talk counter reset.');
      } else if (event.data.type === 'HELIUM_TOGGLE_DEBUG') {
        window.__HELIUM_DEBUG_MODE__ = !window.__HELIUM_DEBUG_MODE__;
        console.log('[Helium HUD] Debug limit toggled:', window.__HELIUM_DEBUG_MODE__);
      }
    }
  });
})();
