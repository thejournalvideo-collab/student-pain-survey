/* Blocks rude words in options students add. Same code is copied into apps-script/Code.gs. */
(function (root) {
  // Whole words (also catches simple endings like -s, -ed, -er, -ing)
  var WORDS = ("fuck fucker fuckers fucking fucked motherfucker fk fck fcuk fuk fking shit shite shitty bullshit " +
    "cunt cunts bitch bitches bastard wanker wank twat prick dick dickhead cock cocksucker pussy slut whore " +
    "ass asshole arse arsehole bollocks bellend knob knobhead tosser piss pissed bugger minger " +
    "retard retarded spastic spaz nigger nigga faggot fag dyke tranny paki chink kike spic wog coon gook " +
    "porn porno nude nudes boobs tits titties dildo cum jizz horny sexy kys stfu wtf milf").split(" ");
  // Strong roots that are rude even inside another word (e.g. "shithead")
  var ROOTS = ["fuck", "shit", "wank", "bitch", "twat", "nigger", "nigga", "faggot", "whore", "slut", "cocksuck", "dickhead", "bellend", "retard", "pussy", "dildo", "porn"];
  var PHRASES = ["kill yourself", "killyourself", "go die", "die in a fire"];
  var ENDINGS = ["", "s", "es", "ed", "er", "ers", "ing", "in", "head", "heads"];
  var LEET = { "0": "o", "1": "i", "!": "i", "|": "i", "3": "e", "4": "a", "@": "a", "5": "s", "$": "s", "7": "t", "8": "b", "9": "g", "+": "t" };

  function squash(s) { return s.replace(/(.)\1+/g, "$1"); }
  function normal(text) {
    var s = String(text || "").toLowerCase();
    if (s.normalize) s = s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
    s = s.replace(/[01!|34@5$789+]/g, function (c) { return LEET[c]; });
    return s.replace(/[^a-z]+/g, " ").trim();
  }
  function isRude(text) {
    var s = normal(text);
    if (!s) return false;
    // "f u c k" -> "fuck"
    var tokens = [], run = "";
    s.split(" ").forEach(function (t) {
      if (t.length === 1) { run += t; return; }
      if (run) { tokens.push(run); run = ""; }
      tokens.push(t);
    });
    if (run) tokens.push(run);
    var joined = tokens.join(" ");
    for (var p = 0; p < PHRASES.length; p++) if ((" " + joined + " ").indexOf(" " + PHRASES[p] + " ") >= 0 || joined.replace(/ /g, "").indexOf(PHRASES[p].replace(/ /g, "")) >= 0) return true;
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i], st = squash(t);
      for (var r = 0; r < ROOTS.length; r++) if (t.indexOf(ROOTS[r]) >= 0) return true;
      for (var w = 0; w < WORDS.length; w++) {
        var word = WORDS[w], sw = squash(word);
        for (var e = 0; e < ENDINGS.length; e++) {
          if (t === word + ENDINGS[e]) return true;
          if (sw.length >= 4 && st === sw + ENDINGS[e]) return true; // "fuuuck", "shiiit"
        }
      }
    }
    return false;
  }
  root.isRude = isRude;
})(typeof window !== "undefined" ? window : this);
