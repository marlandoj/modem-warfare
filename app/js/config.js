// Modem Warfare — build switches. ONE flag in ONE file (Wednesday kill switch).
//
// SOUND decides whether sound exists in the app at all:
//   true   the Sonar row on every Salute screen (CHIRP / LISTEN with the
//          sweep and the HEARD line), chirp send through the speaker, chirp
//          listen through the microphone, and the WebAudio feel (lamp clack,
//          contact bell, fire, splash, hit, damage, sinking horn, stamp,
//          victory sting).
//   false  none of that exists: no AudioContext is ever created, every element
//          marked data-needs-sound is removed from the document at boot, and
//          the match plays by QR alone. Vibration is haptic, not sound, and
//          stays either way (SPEC.md: iOS has no Vibration API, sound carries
//          it there; the reverse holds for a muted phone).
//
// The operator rules on this flag at Wednesday 18:00 on physical-phone
// evidence. To cut sound, change the next line to  export const SOUND = false;
export const SOUND = true;
