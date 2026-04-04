use std::sync::Mutex;
use std::time::{Duration, Instant};

const INACTIVITY_TIMEOUT_SECS: u64 = 300; // 5 minutes

pub struct AuthState {
    locked: bool,
    last_activity: Instant,
}

impl AuthState {
    pub fn new() -> Self {
        Self {
            locked: true,
            last_activity: Instant::now(),
        }
    }

    pub fn is_locked(&self) -> bool {
        self.locked
    }

    pub fn unlock(&mut self) {
        self.locked = false;
        self.last_activity = Instant::now();
    }

    pub fn lock(&mut self) {
        self.locked = true;
    }

    pub fn touch(&mut self) {
        self.last_activity = Instant::now();
    }

    pub fn check_inactivity(&mut self) -> bool {
        if !self.locked && self.last_activity.elapsed() > Duration::from_secs(INACTIVITY_TIMEOUT_SECS) {
            self.locked = true;
            true
        } else {
            false
        }
    }
}
