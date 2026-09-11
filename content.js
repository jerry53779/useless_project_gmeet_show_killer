/**
 * Helium HUD for Google Meet - Content Script (Isolated World)
 * Features Mandatory Auto-Mute Enforcement & Floating Glassmorphic HUD
 */

(function () {
  if (window.__HELIUM_CONTENT_INJECTED__) return;
  window.__HELIUM_CONTENT_INJECTED__ = true;

  console.log('[Helium HUD] Content script initialized.');

  let containerEl = null;
  let shadowRoot = null;
  let hasAutoMutedForCurrentStreak = false;

  let telemetryData = {
    streakSec: 0,
    pitchShift: 0.0,
    isSpeaking: false,
    heliumEnabled: true,
    debugMode: false,
    limitSec: 240
  };

  /**
   * Check if Google Meet microphone is currently muted in UI
   */
  function isGoogleMeetMuted() {
    // 1. Direct check for known muted attributes or aria-labels
    const mutedBtn = document.querySelector(
      'button[data-is-muted="true"], button[aria-label*="Turn on microphone" i], button[aria-label*="Turn on mic" i]'
    );
    if (mutedBtn) return true;

    const unmutedBtn = document.querySelector(
      'button[data-is-muted="false"], button[aria-label*="Turn off microphone" i], button[aria-label*="Turn off mic" i]'
    );
    if (unmutedBtn) return false;

    // 2. Fallback search across all buttons & role="button" elements
    const allButtons = Array.from(document.querySelectorAll('button, div[role="button"]'));
    const micBtn = allButtons.find((btn) => {
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      const tooltip = (btn.getAttribute('data-tooltip') || '').toLowerCase();
      return (
        label.includes('microphone') ||
        label.includes('mic') ||
        tooltip.includes('microphone') ||
        tooltip.includes('mic')
      );
    });

    if (micBtn) {
      const isMutedAttr = micBtn.getAttribute('data-is-muted');
      if (isMutedAttr === 'true') return true;
      if (isMutedAttr === 'false') return false;

      const label = (micBtn.getAttribute('aria-label') || '').toLowerCase();
      if (label.includes('turn on') || label.includes('unmute')) return true;
      if (label.includes('turn off') || label.includes('disable')) return false;
    }

    return false;
  }

  // Poll DOM for Meet UI Mute State every 100ms and sync with inject.js
  setInterval(() => {
    const isMuted = isGoogleMeetMuted();
    window.postMessage(
      {
        source: 'HELIUM_CONTENT',
        type: 'HELIUM_MEET_MUTE_STATE',
        isMeetMuted: isMuted
      },
      '*'
    );
  }, 100);

  /**
   * Find active microphone button in Google Meet DOM
   */
  function findActiveMicButton() {
    const selectors = [
      'button[aria-label*="Turn off microphone" i]',
      'button[aria-label*="Turn off mic" i]',
      'button[data-is-muted="false"]',
      'button[aria-label*="microphone" i][aria-label*="off" i]',
      'button[aria-label*="Disable microphone" i]',
      '[data-is-muted="false"] button'
    ];

    for (const selector of selectors) {
      try {
        const btn = document.querySelector(selector);
        if (btn) return btn;
      } catch (e) {}
    }

    // Fallback search across all buttons & role="button" elements
    const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
    return buttons.find((btn) => {
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      const isMuted = btn.getAttribute('data-is-muted');
      const tooltip = (btn.getAttribute('data-tooltip') || '').toLowerCase();
      return (
        isMuted === 'false' ||
        ((label.includes('microphone') || label.includes('mic') || tooltip.includes('mic')) &&
         (label.includes('off') || label.includes('disable') || label.includes('ctrl + d') || tooltip.includes('off')))
      );
    }) || null;
  }

  /**
   * Mandatory Auto-Mute Execution
   */
  function enforceAutoMute() {
    const micButton = findActiveMicButton();
    if (micButton) {
      console.warn('[Helium HUD] Talk streak limit hit! Triggering Mandatory Auto-Mute via mic button click.');
      micButton.click();
      hasAutoMutedForCurrentStreak = true;
    } else {
      console.warn('[Helium HUD] Mic button selector fallback: dispatching Ctrl+D shortcut to mute Google Meet.');
      // Dispatch Ctrl + D shortcut fallback for Google Meet
      const eventInit = { key: 'd', code: 'KeyD', keyCode: 68, which: 68, ctrlKey: true, bubbles: true, cancelable: true };
      window.dispatchEvent(new KeyboardEvent('keydown', eventInit));
      document.dispatchEvent(new KeyboardEvent('keydown', eventInit));
      hasAutoMutedForCurrentStreak = true;
    }
  }

  /**
   * Construct Shadow DOM Floating Glassmorphic HUD
   */
  function createHUD() {
    if (containerEl) return;

    containerEl = document.createElement('div');
    containerEl.id = 'helium-hud-root';
    containerEl.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 24px;
      z-index: 999999;
      pointer-events: auto;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    shadowRoot = containerEl.attachShadow({ mode: 'open' });

    shadowRoot.innerHTML = `
      <style>
        :host { all: initial; }
        .hud-card {
          width: 320px;
          background: rgba(15, 23, 42, 0.88);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.14);
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
          border-radius: 16px;
          padding: 16px;
          color: #f8fafc;
          box-sizing: border-box;
          transition: all 0.3s ease;
        }

        .hud-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }

        .title-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .status-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background-color: #64748b;
          transition: background-color 0.3s, transform 0.3s;
        }
        .status-dot.speaking {
          background-color: #10b981;
          box-shadow: 0 0 10px #10b981;
          animation: pulse 1s infinite alternate;
        }

        @keyframes pulse {
          0% { transform: scale(0.9); }
          100% { transform: scale(1.3); }
        }

        .hud-title {
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          color: #e2e8f0;
        }

        .badge-automute {
          background: rgba(220, 38, 38, 0.2);
          border: 1px solid rgba(239, 68, 68, 0.4);
          color: #fca5a5;
          font-size: 9px;
          font-weight: 800;
          padding: 2px 6px;
          border-radius: 4px;
          letter-spacing: 0.5px;
        }

        .timer-display {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 24px;
          font-weight: 800;
          color: #ffffff;
          margin-bottom: 10px;
          display: flex;
          align-items: baseline;
          justify-content: space-between;
        }

        .timer-label {
          font-size: 12px;
          color: #94a3b8;
          font-weight: 600;
        }

        .timer-limit {
          font-size: 13px;
          color: #64748b;
          font-weight: 500;
        }

        .progress-track {
          width: 100%;
          height: 8px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 9999px;
          overflow: hidden;
          margin-bottom: 12px;
        }

        .progress-fill {
          height: 100%;
          width: 0%;
          border-radius: 9999px;
          transition: width 0.2s linear, background-color 0.3s ease;
        }

        .progress-blue {
          background-color: #3b82f6;
          box-shadow: 0 0 8px rgba(59, 130, 246, 0.5);
        }

        .progress-yellow {
          background-color: #eab308;
          box-shadow: 0 0 8px rgba(234, 179, 8, 0.5);
        }

        .progress-crimson {
          background-color: #dc2626;
          box-shadow: 0 0 12px rgba(220, 38, 38, 0.9);
          animation: danger-pulse 0.8s infinite alternate;
        }

        @keyframes danger-pulse {
          0% { opacity: 0.8; }
          100% { opacity: 1; filter: brightness(1.2); }
        }

        .pitch-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(255, 255, 255, 0.05);
          padding: 8px 12px;
          border-radius: 8px;
          margin-bottom: 14px;
          font-size: 12px;
          font-weight: 600;
        }

        .pitch-label { color: #cbd5e1; }
        .pitch-value { color: #38bdf8; }
        .pitch-value.elevated { color: #f43f5e; font-weight: 800; }
        .pitch-value.muted-status { color: #ef4444; font-weight: 800; }

        .controls-group {
          display: flex;
          gap: 6px;
        }

        .btn {
          flex: 1;
          padding: 8px;
          border: none;
          border-radius: 8px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
        }

        .btn-helium {
          background: rgba(59, 130, 246, 0.2);
          border: 1px solid rgba(59, 130, 246, 0.4);
          color: #93c5fd;
        }
        .btn-helium.active {
          background: #2563eb;
          border-color: #3b82f6;
          color: #ffffff;
          box-shadow: 0 0 10px rgba(37, 99, 235, 0.5);
        }

        .btn-reset {
          background: rgba(220, 38, 38, 0.2);
          border: 1px solid rgba(239, 68, 68, 0.4);
          color: #fca5a5;
        }
        .btn-reset:hover {
          background: #dc2626;
          color: #ffffff;
        }

        .btn-test {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #cbd5e1;
        }
        .btn-test.active {
          background: #d97706;
          border-color: #f59e0b;
          color: #ffffff;
        }
      </style>

      <div class="hud-card">
        <div class="hud-header">
          <div class="title-group">
            <div class="status-dot" id="statusDot"></div>
            <span class="hud-title">Helium HUD</span>
          </div>
          <span class="badge-automute">AUTO-MUTE ON</span>
        </div>

        <div class="timer-display">
          <span class="timer-label">Streak:</span>
          <div>
            <span id="timerText">00:00</span>
            <span class="timer-limit" id="limitText">/ 04:00</span>
          </div>
        </div>

        <div class="progress-track">
          <div class="progress-fill progress-blue" id="progressFill"></div>
        </div>

        <div class="pitch-banner">
          <span class="pitch-label">Audio Mode</span>
          <span class="pitch-value" id="pitchValue">Normal (0.0 st)</span>
        </div>

        <div class="controls-group">
          <button class="btn btn-helium active" id="heliumToggleBtn">
            🎈 Helium: ON
          </button>
          <button class="btn btn-reset" id="resetBtn">
            🔄 Reset
          </button>
          <button class="btn btn-test" id="testBtn">
            ⏱ 10s Test
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(containerEl);

    // Attach Event Listeners
    shadowRoot.getElementById('heliumToggleBtn').addEventListener('click', () => {
      window.postMessage({ source: 'HELIUM_CONTENT', type: 'HELIUM_TOGGLE' }, '*');
    });

    shadowRoot.getElementById('resetBtn').addEventListener('click', () => {
      hasAutoMutedForCurrentStreak = false;
      window.postMessage({ source: 'HELIUM_CONTENT', type: 'HELIUM_RESET' }, '*');
    });

    shadowRoot.getElementById('testBtn').addEventListener('click', () => {
      hasAutoMutedForCurrentStreak = false;
      window.postMessage({ source: 'HELIUM_CONTENT', type: 'HELIUM_TOGGLE_DEBUG' }, '*');
    });
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  /**
   * Update HUD UI & Enforce Auto-Mute
   */
  function updateHUD(detail) {
    telemetryData = detail;
    if (!shadowRoot) return;

    const streakSec = detail.streakSec || 0;
    const limitSec = detail.limitSec || 240;
    const pitchShift = detail.pitchShift || 0.0;
    const isSpeaking = detail.isSpeaking;
    const heliumEnabled = detail.heliumEnabled;
    const debugMode = detail.debugMode;

    // Check Auto-Mute condition
    if (streakSec >= limitSec) {
      if (!hasAutoMutedForCurrentStreak) {
        enforceAutoMute();
      }
    } else {
      hasAutoMutedForCurrentStreak = false;
    }

    // Status Dot & Timer State
    const statusDot = shadowRoot.getElementById('statusDot');
    if (statusDot) {
      statusDot.className = 'status-dot';
      if (detail.timerState === 'RUNNING') {
        statusDot.classList.add('speaking');
        statusDot.style.backgroundColor = '#10b981';
      } else if (detail.timerState === 'PAUSED') {
        statusDot.style.backgroundColor = '#eab308'; // Amber for Paused
      } else {
        statusDot.style.backgroundColor = '#64748b'; // Gray for Muted/Stopped
      }
    }

    // Timer Text
    const timerText = shadowRoot.getElementById('timerText');
    const limitText = shadowRoot.getElementById('limitText');
    if (timerText) timerText.textContent = formatTime(streakSec);
    if (limitText) limitText.textContent = `/ ${formatTime(limitSec)}`;

    // Multi-stage Progress Bar
    const progressFill = shadowRoot.getElementById('progressFill');
    if (progressFill) {
      const percentage = Math.min(100, (streakSec / limitSec) * 100);
      progressFill.style.width = `${percentage}%`;

      progressFill.className = 'progress-fill ';
      if (streakSec >= limitSec) {
        progressFill.classList.add('progress-crimson');
      } else if (percentage >= 75) {
        progressFill.classList.add('progress-yellow');
      } else {
        progressFill.classList.add('progress-blue');
      }
    }

    // Pitch & Status Display
    const pitchValue = shadowRoot.getElementById('pitchValue');
    if (pitchValue) {
      if (streakSec >= limitSec) {
        pitchValue.textContent = '🛑 LIMIT REACHED: MUTED';
        pitchValue.className = 'pitch-value muted-status';
      } else if (pitchShift > 0.0 && heliumEnabled) {
        pitchValue.textContent = `🚨 Chipmunk: +${pitchShift.toFixed(1)} st`;
        pitchValue.className = 'pitch-value elevated';
      } else {
        pitchValue.textContent = 'Normal (0.0 st)';
        pitchValue.className = 'pitch-value';
      }
    }

    // Button states
    const heliumToggleBtn = shadowRoot.getElementById('heliumToggleBtn');
    if (heliumToggleBtn) {
      if (heliumEnabled) {
        heliumToggleBtn.classList.add('active');
        heliumToggleBtn.textContent = '🎈 Helium: ON';
      } else {
        heliumToggleBtn.classList.remove('active');
        heliumToggleBtn.textContent = '🎈 Helium: OFF';
      }
    }

    const testBtn = shadowRoot.getElementById('testBtn');
    if (testBtn) {
      if (debugMode) {
        testBtn.classList.add('active');
        testBtn.textContent = '⚡ 10s Active';
      } else {
        testBtn.classList.remove('active');
        testBtn.textContent = '⏱ 10s Test';
      }
    }
  }

  // Telemetry IPC listener from inject.js
  window.addEventListener('message', (event) => {
    if (
      event.data &&
      event.data.source === 'HELIUM_INJECT' &&
      event.data.type === 'HELIUM_TELEMETRY'
    ) {
      updateHUD(event.data.detail);
    }
  });

  // Poll DOM for active Google Meet room
  setInterval(() => {
    const inMeeting = !!(
      document.querySelector('button[aria-label*="Leave call"]') ||
      document.querySelector('button[aria-label*="leave"]') ||
      document.querySelector('[data-is-muted]') ||
      document.querySelector('div[aria-label*="Call details"]') ||
      document.querySelector('[data-meeting-title]')
    );

    if (inMeeting) {
      if (!containerEl) createHUD();
      if (containerEl) containerEl.style.display = 'block';
    } else {
      if (containerEl) containerEl.style.display = 'none';
    }
  }, 1000);
})();
