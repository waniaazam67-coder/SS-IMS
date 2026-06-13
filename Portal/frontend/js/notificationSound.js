(function () {
  const SOUND_PATH = "assets/notification.wav";
  let unlocked = false;
  let baseAudio = null;

  function ensureAudio() {
    if (!baseAudio) {
      baseAudio = new Audio(SOUND_PATH);
      baseAudio.preload = "auto";
    }
    return baseAudio;
  }

  function unlock() {
    unlocked = true;
    try {
      ensureAudio().load();
    } catch (error) {
      console.warn("Notification sound could not be prepared:", error);
    }
  }

  function play() {
    if (!unlocked) return false;
    try {
      const audio = ensureAudio().cloneNode(true);
      audio.volume = 0.55;
      const result = audio.play();
      if (result?.catch) {
        result.catch((error) => {
          console.warn("Notification sound blocked by browser:", error);
        });
      }
      return true;
    } catch (error) {
      console.warn("Notification sound failed:", error);
      return false;
    }
  }

  window.IMSNotificationSound = {
    unlock,
    play
  };
})();
