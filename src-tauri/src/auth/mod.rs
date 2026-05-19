use std::time::{Duration, Instant};

const DEFAULT_INACTIVITY_TIMEOUT_SECS: u64 = 300; // 5 minutes
const GRACE_PERIOD_SECS: u64 = 30;
const AUTO_LOCK_TIMEOUT_SERVICE: &str = "com.rpyncierto.gila";
const AUTO_LOCK_TIMEOUT_USER: &str = "gila-auto-lock-timeout";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AutoLockTimeout {
    Never,
    FiveMinutes,
    FifteenMinutes,
    OneHour,
}

impl AutoLockTimeout {
    pub fn from_storage_value(value: &str) -> Option<Self> {
        match value {
            "never" => Some(Self::Never),
            "5m" => Some(Self::FiveMinutes),
            "15m" => Some(Self::FifteenMinutes),
            "1h" => Some(Self::OneHour),
            _ => None,
        }
    }

    pub fn storage_value(self) -> &'static str {
        match self {
            Self::Never => "never",
            Self::FiveMinutes => "5m",
            Self::FifteenMinutes => "15m",
            Self::OneHour => "1h",
        }
    }

    pub fn duration(self) -> Option<Duration> {
        match self {
            Self::Never => None,
            Self::FiveMinutes => Some(Duration::from_secs(DEFAULT_INACTIVITY_TIMEOUT_SECS)),
            Self::FifteenMinutes => Some(Duration::from_secs(900)),
            Self::OneHour => Some(Duration::from_secs(3600)),
        }
    }
}

fn auto_lock_timeout_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(AUTO_LOCK_TIMEOUT_SERVICE, AUTO_LOCK_TIMEOUT_USER).map_err(|e| e.to_string())
}

pub fn load_auto_lock_timeout() -> AutoLockTimeout {
    let Ok(entry) = auto_lock_timeout_entry() else {
        return AutoLockTimeout::FiveMinutes;
    };

    match entry.get_password() {
        Ok(value) => AutoLockTimeout::from_storage_value(&value).unwrap_or(AutoLockTimeout::FiveMinutes),
        Err(_) => AutoLockTimeout::FiveMinutes,
    }
}

pub fn save_auto_lock_timeout(timeout: AutoLockTimeout) -> Result<(), String> {
    let entry = auto_lock_timeout_entry()?;
    entry
        .set_password(timeout.storage_value())
        .map_err(|e| e.to_string())
}

pub struct AuthState {
    locked: bool,
    manual_lock: bool,
    last_activity: Instant,
    last_auth: Option<Instant>,
    auto_lock_timeout: AutoLockTimeout,
}

impl AuthState {
    pub fn new(auto_lock_timeout: AutoLockTimeout) -> Self {
        Self {
            locked: true,
            manual_lock: false,
            last_activity: Instant::now(),
            last_auth: None,
            auto_lock_timeout,
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

    pub fn auto_lock_timeout(&self) -> AutoLockTimeout {
        self.auto_lock_timeout
    }

    pub fn set_auto_lock_timeout(&mut self, timeout: AutoLockTimeout) {
        self.auto_lock_timeout = timeout;
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
        let Some(timeout) = self.auto_lock_timeout.duration() else {
            return false;
        };

        if !self.locked && self.last_activity.elapsed() > timeout {
            self.locked = true;
            self.last_auth = None;
            true
        } else {
            false
        }
    }
}
