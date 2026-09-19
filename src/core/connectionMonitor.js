/**
 * connectionMonitor.js — Connection health monitoring and diagnostics module for NEXORA-MD.
 *
 * Provides connection state tracking, heartbeat monitoring, reconnect diagnostics,
 * event metrics, and auto-recovery evaluation.
 */

// ── Connection State Machine ─────────────────────────────────────────────────
export class ConnectionStateMachine {
  static VALID_STATES = [
    'disconnected',
    'connecting',
    'connected',
    'reconnecting',
    'error',
    'logged_out'
  ];

  constructor() {
    this.state = 'disconnected';
    this.history = [];
    this.connectedAt = null;
    this.accumulatedUptime = 0;
  }

  getState() {
    return this.state;
  }

  transitionTo(newState, reason = null) {
    try {
      if (!ConnectionStateMachine.VALID_STATES.includes(newState)) {
        console.error(`[CONNECTION_MONITOR] Invalid state transition attempted: ${newState}`);
        newState = 'error';
      }

      const previousState = this.state;
      const now = Date.now();

      // Uptime accounting
      if (previousState === 'connected' && newState !== 'connected') {
        if (this.connectedAt) {
          this.accumulatedUptime += (now - this.connectedAt);
          this.connectedAt = null;
        }
      } else if (newState === 'connected' && previousState !== 'connected') {
        this.connectedAt = now;
      }

      this.state = newState;

      const transitionEntry = {
        state: newState,
        from: previousState,
        to: newState,
        timestamp: now,
        reason: reason ? String(reason) : null
      };

      this.history.push(transitionEntry);
      if (this.history.length > 50) {
        this.history.shift();
      }

      console.log(`[CONNECTION_MONITOR] State transition: ${previousState} -> ${newState}${reason ? ` (${reason})` : ''}`);
    } catch (err) {
      console.error('[CONNECTION_MONITOR] Error in transitionTo:', err.message || err);
    }
  }

  getStateHistory() {
    return [...this.history];
  }

  getUptime() {
    if (this.state === 'connected' && this.connectedAt) {
      return this.accumulatedUptime + (Date.now() - this.connectedAt);
    }
    return this.accumulatedUptime;
  }
}

// ── Event Metrics ────────────────────────────────────────────────────────────
export class EventMetrics {
  constructor() {
    this.resetMetrics();
  }

  resetMetrics() {
    this.messagesReceived = 0;
    this.messagesSent = 0;
    this.commandsExecuted = 0;
    this.errorsCaught = 0;
    this.reconnects = 0;
    this.groupEvents = 0;
    return this.getMetrics();
  }

  recordIncomingMessage() {
    this.messagesReceived++;
  }

  recordOutgoingMessage() {
    this.messagesSent++;
  }

  recordCommandExecuted() {
    this.commandsExecuted++;
  }

  recordErrorCaught() {
    this.errorsCaught++;
  }

  recordReconnect() {
    this.reconnects++;
  }

  recordGroupEvent() {
    this.groupEvents++;
  }

  getMetrics() {
    return {
      messagesReceived: this.messagesReceived,
      messagesSent: this.messagesSent,
      commandsExecuted: this.commandsExecuted,
      errorsCaught: this.errorsCaught,
      reconnects: this.reconnects,
      groupEvents: this.groupEvents
    };
  }
}

// ── Heartbeat Monitor ────────────────────────────────────────────────────────
export class HeartbeatMonitor {
  constructor(monitor = null) {
    this.monitor = monitor;
    this.lastIncoming = null;
    this.lastOutgoing = null;
    this.latency = 0;
    this.checkInterval = null;
    this._stallWarningLogged = false;
  }

  recordIncoming() {
    this.lastIncoming = Date.now();
    this._stallWarningLogged = false;
  }

  recordOutgoing() {
    this.lastOutgoing = Date.now();
  }

  recordLatency(ms) {
    if (typeof ms === 'number' && !isNaN(ms) && ms >= 0) {
      this.latency = Math.round(ms);
    }
  }

  getLatency() {
    return this.latency;
  }

  checkHeartbeat() {
    try {
      const currentState = this.monitor ? this.monitor.getState() : null;
      if (currentState === 'connected') {
        const now = Date.now();
        const STALL_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

        if (this.lastIncoming) {
          const age = now - this.lastIncoming;
          if (age >= STALL_THRESHOLD_MS) {
            if (!this._stallWarningLogged) {
              console.warn('[CONNECTION_MONITOR] Warning: No messages received for 5 minutes while connected.');
              this._stallWarningLogged = true;
            }
          } else {
            this._stallWarningLogged = false;
          }
        }
      }
    } catch (err) {
      console.error('[CONNECTION_MONITOR] Error checking heartbeat:', err.message || err);
    }
  }

  startHeartbeatCheck(intervalMs = 30000) {
    this.stopHeartbeatCheck();
    this.checkInterval = setInterval(() => this.checkHeartbeat(), intervalMs);
    if (this.checkInterval && typeof this.checkInterval.unref === 'function') {
      this.checkInterval.unref();
    }
  }

  stopHeartbeatCheck() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  getHealth() {
    const now = Date.now();
    const state = this.monitor ? this.monitor.getState() : 'disconnected';
    const lastIncomingAge = this.lastIncoming ? (now - this.lastIncoming) : null;
    const lastOutgoingAge = this.lastOutgoing ? (now - this.lastOutgoing) : null;

    const metrics = this.monitor ? this.monitor.getMetrics() : { messagesReceived: 0, messagesSent: 0, errorsCaught: 0 };
    const totalMessages = (metrics.messagesReceived || 0) + (metrics.messagesSent || 0);
    const totalErrors = metrics.errorsCaught || 0;
    const uptime = this.monitor ? this.monitor.getUptime() : 0;

    return {
      state,
      lastIncomingAge,
      lastOutgoingAge,
      totalMessages,
      totalErrors,
      uptime
    };
  }
}

// ── Reconnect Diagnostics ────────────────────────────────────────────────────
export class ReconnectDiagnostics {
  constructor() {
    this.history = [];
    this.totalAttempts = 0;
    this.successfulReconnects = 0;
    this.failedReconnects = 0;
    this.currentAttempts = 0;
    this.lastReconnectTime = null;
    this.totalReconnectDuration = 0;
  }

  recordAttempt(reason = 'Unknown', attemptNumber = null) {
    try {
      this.totalAttempts++;
      this.currentAttempts = attemptNumber ?? (this.currentAttempts + 1);
      this.lastReconnectTime = Date.now();

      const entry = {
        timestamp: this.lastReconnectTime,
        attempt: this.currentAttempts,
        reason: String(reason || 'Unknown'),
        status: 'in_progress',
        duration: null
      };

      this.history.push(entry);
      if (this.history.length > 50) {
        this.history.shift();
      }

      console.log(`[CONNECTION_MONITOR] Reconnect attempt #${this.currentAttempts} recorded. Reason: ${reason}`);
    } catch (err) {
      console.error('[CONNECTION_MONITOR] Error recording reconnect attempt:', err.message || err);
    }
  }

  recordSuccess() {
    try {
      this.successfulReconnects++;
      const now = Date.now();

      if (this.history.length > 0) {
        const lastEntry = this.history[this.history.length - 1];
        if (lastEntry.status === 'in_progress') {
          lastEntry.status = 'success';
          lastEntry.duration = now - lastEntry.timestamp;
          this.totalReconnectDuration += lastEntry.duration;
        }
      }

      this.currentAttempts = 0;
      console.log('[CONNECTION_MONITOR] Reconnect succeeded.');
    } catch (err) {
      console.error('[CONNECTION_MONITOR] Error recording reconnect success:', err.message || err);
    }
  }

  recordFailure(reason = 'Failed', statusCode = null) {
    try {
      this.failedReconnects++;
      const now = Date.now();

      if (this.history.length > 0) {
        const lastEntry = this.history[this.history.length - 1];
        if (lastEntry.status === 'in_progress') {
          lastEntry.status = 'failed';
          lastEntry.duration = now - lastEntry.timestamp;
          lastEntry.failureReason = String(reason);
          lastEntry.statusCode = statusCode;
        }
      }

      console.warn(`[CONNECTION_MONITOR] Reconnect failed. Reason: ${reason}${statusCode ? ` (Code: ${statusCode})` : ''}`);
    } catch (err) {
      console.error('[CONNECTION_MONITOR] Error recording reconnect failure:', err.message || err);
    }
  }

  getReconnectHistory() {
    return [...this.history];
  }

  getReconnectStats() {
    return {
      totalAttempts: this.totalAttempts,
      successfulReconnects: this.successfulReconnects,
      failedReconnects: this.failedReconnects,
      currentAttempts: this.currentAttempts,
      lastReconnectTime: this.lastReconnectTime,
      avgReconnectTime: this.successfulReconnects > 0
        ? Math.round(this.totalReconnectDuration / this.successfulReconnects)
        : 0
    };
  }
}

// ── Auto Recovery ────────────────────────────────────────────────────────────
export class AutoRecovery {
  static shouldAutoRecover(state, lastError = null) {
    try {
      if (state === 'logged_out' || state === 'connection_replaced') {
        return false;
      }

      if (lastError !== null && lastError !== undefined) {
        let statusCode = null;
        let errMsg = '';

        if (typeof lastError === 'number') {
          statusCode = lastError;
        } else if (typeof lastError === 'string') {
          errMsg = lastError.toLowerCase();
        } else if (typeof lastError === 'object') {
          statusCode = lastError.output?.statusCode || lastError.statusCode || lastError.code || null;
          errMsg = (lastError.message || lastError.reason || JSON.stringify(lastError)).toLowerCase();
        }

        // Fatal WhatsApp disconnect status codes:
        // 401 = loggedOut, 405 = connectionReplaced, 403 = badSession
        if (statusCode === 401 || statusCode === 405 || statusCode === 403) {
          return false;
        }

        if (
          errMsg.includes('logged_out') ||
          errMsg.includes('loggedout') ||
          errMsg.includes('logged out') ||
          errMsg.includes('connection_replaced') ||
          errMsg.includes('connectionreplaced') ||
          errMsg.includes('connection replaced') ||
          errMsg.includes('bad_session') ||
          errMsg.includes('badsession') ||
          errMsg.includes('bad session')
        ) {
          return false;
        }
      }

      return true;
    } catch (err) {
      console.error('[CONNECTION_MONITOR] Error evaluating shouldAutoRecover:', err.message || err);
      return true;
    }
  }

  shouldAutoRecover(state, lastError = null) {
    return AutoRecovery.shouldAutoRecover(state, lastError);
  }
}

// ── Main Connection Monitor Class ───────────────────────────────────────────
export class ConnectionMonitor {
  constructor() {
    this.stateMachine = new ConnectionStateMachine();
    this.heartbeat = new HeartbeatMonitor(this);
    this.reconnectDiagnostics = new ReconnectDiagnostics();
    this.metrics = new EventMetrics();
    this.autoRecovery = new AutoRecovery();
    this.socket = null;

    this.heartbeat.startHeartbeatCheck();
  }

  // ── ConnectionStateMachine Facade ──────────────────────────────────────────
  getState() {
    return this.stateMachine.getState();
  }

  getStateHistory() {
    return this.stateMachine.getStateHistory();
  }

  getUptime() {
    return this.stateMachine.getUptime();
  }

  transitionTo(newState, reason = null) {
    this.stateMachine.transitionTo(newState, reason);
  }

  // ── HeartbeatMonitor Facade ────────────────────────────────────────────────
  getHealth() {
    return this.heartbeat.getHealth();
  }

  recordLatency(ms) {
    this.heartbeat.recordLatency(ms);
  }

  // ── ReconnectDiagnostics Facade ────────────────────────────────────────────
  getReconnectHistory() {
    return this.reconnectDiagnostics.getReconnectHistory();
  }

  getReconnectStats() {
    return this.reconnectDiagnostics.getReconnectStats();
  }

  // ── EventMetrics Facade ────────────────────────────────────────────────────
  getMetrics() {
    return this.metrics.getMetrics();
  }

  resetMetrics() {
    return this.metrics.resetMetrics();
  }

  // ── AutoRecovery Facade ────────────────────────────────────────────────────
  shouldAutoRecover(state, lastError = null) {
    return this.autoRecovery.shouldAutoRecover(state, lastError);
  }

  // ── Integration Lifecycle Hooks ────────────────────────────────────────────
  recordConnecting(reason = 'Initializing connection') {
    this.transitionTo('connecting', reason);
  }

  recordConnected(sock = null) {
    this.transitionTo('connected', 'Connection open');
    this.reconnectDiagnostics.recordSuccess();
    if (sock) {
      this.attachSocket(sock);
    }
  }

  recordDisconnect(reason = 'Disconnected', statusCode = null, errorMessage = null) {
    const isLoggedOut = statusCode === 401 || reason === 'logged_out' || errorMessage?.includes('logged_out');
    const isReplaced = statusCode === 405 || reason === 'connection_replaced' || errorMessage?.includes('connection_replaced');

    if (isLoggedOut) {
      this.transitionTo('logged_out', errorMessage || reason);
    } else if (isReplaced) {
      this.transitionTo('error', 'connection_replaced');
    } else {
      this.transitionTo('disconnected', errorMessage || reason);
    }

    this.reconnectDiagnostics.recordFailure(reason, statusCode);
  }

  recordReconnectAttempt(reason = 'Network disconnect', attemptNumber = 1) {
    this.transitionTo('reconnecting', reason);
    this.reconnectDiagnostics.recordAttempt(reason, attemptNumber);
    this.metrics.recordReconnect();
  }

  recordIncomingMessage(rawMessage = null) {
    this.heartbeat.recordIncoming();
    this.metrics.recordIncomingMessage();
  }

  recordOutgoingMessage() {
    this.heartbeat.recordOutgoing();
    this.metrics.recordOutgoingMessage();
  }

  recordCommandExecuted(cmdName = null) {
    this.metrics.recordCommandExecuted();
  }

  recordErrorCaught(err = null) {
    this.metrics.recordErrorCaught();
    if (err) {
      console.error('[CONNECTION_MONITOR] Error caught:', err.message || err);
    }
  }

  recordGroupEvent(update = null) {
    this.metrics.recordGroupEvent();
  }

  attachSocket(sock) {
    if (!sock) return;
    this.socket = sock;
    if (!sock._connectionMonitorPatched && typeof sock.sendMessage === 'function') {
      const originalSendMessage = sock.sendMessage.bind(sock);
      const monitor = this;
      sock.sendMessage = async function (...args) {
        try {
          const res = await originalSendMessage(...args);
          monitor.recordOutgoingMessage();
          return res;
        } catch (err) {
          monitor.recordErrorCaught(err);
          throw err;
        }
      };
      sock._connectionMonitorPatched = true;
    }
  }

  stop() {
    this.heartbeat.stopHeartbeatCheck();
  }
}

// Export singleton instance
export const connectionMonitor = new ConnectionMonitor();

// Export default
export default connectionMonitor;
