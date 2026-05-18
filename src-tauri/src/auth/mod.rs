use std::time::{Duration, Instant};

const INACTIVITY_TIMEOUT_SECS: u64 = 300; // 5 minutes
const GRACE_PERIOD_SECS: u64 = 30;

pub struct AuthState {
    locked: bool,
    manual_lock: bool,
    last_activity: Instant,
    last_auth: Option<Instant>,
}

impl AuthState {
    pub fn new() -> Self {
        Self {
            locked: true,
            manual_lock: false,
            last_activity: Instant::now(),
            last_auth: None,
        }
    }

    pub fn is_locked(&self) -> bool {
        self.locked
    }

    pub fn unlock(&mut self) {
        self.locked = false;
        self.manual_lock = false;
        self.last_activity = Instant::now();
        self.last_auth = Some(Instant::now());
    }

    pub fn lock_manual(&mut self) {
        self.locked = true;
        self.manual_lock = true;
        self.last_auth = None;
    }

    pub fn clear_manual_lock(&mut self) {
        self.manual_lock = false;
    }

    pub fn is_manual_lock(&self) -> bool {
        self.manual_lock
    }

    pub fn touch(&mut self) {
        self.last_activity = Instant::now();
    }

    pub fn record_auth(&mut self) {
        self.manual_lock = false;
        self.last_auth = Some(Instant::now());
    }

    /// Returns true if within the 30-second grace period.
    pub fn is_within_grace_period(&self) -> bool {
        match self.last_auth {
            Some(t) => t.elapsed() < Duration::from_secs(GRACE_PERIOD_SECS),
            None => false,
        }
    }

    pub fn check_inactivity(&mut self) -> bool {
        if !self.locked && self.last_activity.elapsed() > Duration::from_secs(INACTIVITY_TIMEOUT_SECS) {
            self.locked = true;
            self.last_auth = None;
            true
        } else {
            false
        }
    }
}
