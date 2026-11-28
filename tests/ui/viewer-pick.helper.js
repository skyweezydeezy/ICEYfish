// T-134: a card in a question sheet opens the viewer when it is tapped; picking it is the button there. Call this right after tapping (or clicking) an option:
// it waits out the viewer's 350 ms ghost-tap guard, presses the pick button if the viewer opened (an option with no card picks at once, so there is nothing to press),
// and closes the viewer if it stayed open (picking several cards keeps it open to swipe on).
module.exports = async function viewerPick(p) {
  await p.waitForTimeout(450);
  const b = await p.$('#lightbox.show .lb-act:not([disabled])');
  if (b) { await b.click(); await p.waitForTimeout(150); }
  if (await p.$('#lightbox.show')) { await p.keyboard.press('Escape'); await p.waitForTimeout(150); }
};
