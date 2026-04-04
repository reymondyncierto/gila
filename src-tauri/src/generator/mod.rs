use rand::seq::SliceRandom;
use rand::Rng;
use serde::Deserialize;

const LOWERCASE: &[u8] = b"abcdefghijklmnopqrstuvwxyz";
const UPPERCASE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS: &[u8] = b"0123456789";
const SYMBOLS: &[u8] = b"!@#$%^&*()-_=+[]{}|;:,.<>?";

const WORDLIST: &[&str] = &[
    "apple", "arrow", "bacon", "badge", "beach", "blade", "blank", "blaze", "block", "board",
    "bonus", "brave", "brick", "brief", "bring", "brook", "brush", "burst", "cabin", "cable",
    "camel", "candy", "cargo", "chain", "chalk", "charm", "chase", "chief", "cider", "claim",
    "clash", "climb", "clock", "cloud", "coach", "coral", "couch", "crane", "crash", "cream",
    "crisp", "cross", "crown", "crush", "curve", "daisy", "dance", "delta", "dense", "derby",
    "draft", "drain", "dream", "dress", "drift", "drive", "eagle", "earth", "ember", "equal",
    "event", "extra", "fable", "feast", "fence", "fiber", "field", "flame", "flash", "fleet",
    "float", "flood", "floor", "flour", "fluid", "forge", "frame", "frost", "fruit", "giant",
    "globe", "grace", "grain", "grand", "grape", "grasp", "grave", "green", "grind", "grove",
    "guard", "guide", "haven", "heart", "hiker", "honey", "horse", "hotel", "house", "ivory",
    "jewel", "joint", "juice", "knack", "knock", "label", "lance", "latch", "layer", "lemon",
    "light", "linen", "lodge", "lunar", "maple", "march", "marsh", "mason", "melon", "metal",
    "mirth", "model", "money", "motor", "mount", "noble", "north", "novel", "nurse", "ocean",
    "olive", "orbit", "otter", "outer", "oxide", "paint", "panel", "patch", "pearl", "pedal",
    "penny", "perch", "pilot", "pixel", "plane", "plant", "plaza", "plumb", "plume", "point",
    "polar", "pouch", "power", "press", "pride", "prime", "print", "prize", "proof", "pulse",
    "quake", "queen", "quest", "quiet", "quilt", "radar", "range", "rapid", "raven", "reach",
    "ridge", "river", "robin", "robot", "rocky", "royal", "ruler", "rusty", "saint", "scale",
    "scene", "scout", "shaft", "sharp", "shell", "shift", "shine", "shore", "sigma", "slate",
    "slide", "slope", "smart", "smoke", "snowy", "solar", "solid", "spark", "spear", "spice",
    "spine", "spoke", "stack", "staff", "stage", "stamp", "stand", "stark", "steam", "steel",
    "steep", "stern", "stock", "stone", "storm", "story", "stove", "strap", "straw", "style",
    "sugar", "surge", "swamp", "sweep", "swift", "sword", "table", "thorn", "tiger", "token",
    "torch", "tower", "track", "trail", "train", "trend", "trial", "trick", "trout", "trunk",
    "tulip", "ultra", "umbra", "union", "unity", "upper", "urban", "valid", "valor", "valve",
    "vault", "vigor", "vivid", "voice", "waste", "watch", "water", "wheat", "wheel", "white",
];

#[derive(Debug, Deserialize)]
pub struct GeneratorOptions {
    pub mode: String, // "character" or "passphrase"
    pub length: Option<usize>,
    pub uppercase: Option<bool>,
    pub lowercase: Option<bool>,
    pub digits: Option<bool>,
    pub symbols: Option<bool>,
    pub word_count: Option<usize>,
    pub separator: Option<String>,
}

pub fn generate_password(opts: &GeneratorOptions) -> Result<String, String> {
    let mut rng = rand::thread_rng();

    if opts.mode == "passphrase" {
        let count = opts.word_count.unwrap_or(4).clamp(3, 10);
        let sep = opts.separator.as_deref().unwrap_or("-");
        let words: Vec<&str> = WORDLIST
            .choose_multiple(&mut rng, count)
            .cloned()
            .collect();
        return Ok(words.join(sep));
    }

    // Character mode
    let length = opts.length.unwrap_or(16).clamp(8, 128);
    let mut charset: Vec<u8> = Vec::new();

    if opts.lowercase.unwrap_or(true) {
        charset.extend_from_slice(LOWERCASE);
    }
    if opts.uppercase.unwrap_or(true) {
        charset.extend_from_slice(UPPERCASE);
    }
    if opts.digits.unwrap_or(true) {
        charset.extend_from_slice(DIGITS);
    }
    if opts.symbols.unwrap_or(false) {
        charset.extend_from_slice(SYMBOLS);
    }

    if charset.is_empty() {
        return Err("At least one character set must be enabled".to_string());
    }

    let password: String = (0..length)
        .map(|_| {
            let idx = rng.gen_range(0..charset.len());
            charset[idx] as char
        })
        .collect();

    Ok(password)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_character_mode_default() {
        let opts = GeneratorOptions {
            mode: "character".to_string(),
            length: Some(16),
            uppercase: Some(true),
            lowercase: Some(true),
            digits: Some(true),
            symbols: Some(false),
            word_count: None,
            separator: None,
        };
        let pw = generate_password(&opts).unwrap();
        assert_eq!(pw.len(), 16);
    }

    #[test]
    fn test_character_mode_with_symbols() {
        let opts = GeneratorOptions {
            mode: "character".to_string(),
            length: Some(32),
            uppercase: Some(true),
            lowercase: Some(true),
            digits: Some(true),
            symbols: Some(true),
            word_count: None,
            separator: None,
        };
        let pw = generate_password(&opts).unwrap();
        assert_eq!(pw.len(), 32);
    }

    #[test]
    fn test_character_mode_min_length() {
        let opts = GeneratorOptions {
            mode: "character".to_string(),
            length: Some(4), // below min, should clamp to 8
            uppercase: Some(true),
            lowercase: Some(true),
            digits: Some(true),
            symbols: Some(false),
            word_count: None,
            separator: None,
        };
        let pw = generate_password(&opts).unwrap();
        assert_eq!(pw.len(), 8);
    }

    #[test]
    fn test_passphrase_mode() {
        let opts = GeneratorOptions {
            mode: "passphrase".to_string(),
            length: None,
            uppercase: None,
            lowercase: None,
            digits: None,
            symbols: None,
            word_count: Some(4),
            separator: Some("-".to_string()),
        };
        let pw = generate_password(&opts).unwrap();
        let words: Vec<&str> = pw.split('-').collect();
        assert_eq!(words.len(), 4);
    }

    #[test]
    fn test_empty_charset_error() {
        let opts = GeneratorOptions {
            mode: "character".to_string(),
            length: Some(16),
            uppercase: Some(false),
            lowercase: Some(false),
            digits: Some(false),
            symbols: Some(false),
            word_count: None,
            separator: None,
        };
        assert!(generate_password(&opts).is_err());
    }

    #[test]
    fn test_uniqueness() {
        let opts = GeneratorOptions {
            mode: "character".to_string(),
            length: Some(20),
            uppercase: Some(true),
            lowercase: Some(true),
            digits: Some(true),
            symbols: Some(true),
            word_count: None,
            separator: None,
        };
        let pw1 = generate_password(&opts).unwrap();
        let pw2 = generate_password(&opts).unwrap();
        assert_ne!(pw1, pw2);
    }
}
