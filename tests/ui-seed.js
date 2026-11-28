// Pins the games a page starts, so a Duel or Practice opening (hands, who goes first, a counter question in the mulligan) is the same on every run.
// versus.js and app.js take their next game's seed from window.ISFTutorial.takeSeed() (the tutorial's sample game uses it); a test replaces it after the page loads.
// Game k of the page gets seed SEED + k. SEED = 10: the dice give seat 0 (you) the first turn, and the Duel in phone-card-tap goes on to the opponent's attack and the
// block question (seed 9 ends the game first, which skips the 'Duel blocker' checks; T-138 found it by comparing the check names with an unpinned full run).
exports.SEED = 10;
exports.pin = (page, seed = exports.SEED) => page.evaluate(s => { let k = 0; window.ISFTutorial.takeSeed = () => (s + k++) >>> 0; }, seed);
