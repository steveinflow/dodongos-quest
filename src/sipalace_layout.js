// SKULL ISLAND stage 4, THE SKULL PALACE -- the numbers the stage's picture (src/stages/sipalace.js) and the fight (src/sipalace.js) both stand on
// (world x, and screen y where the backdrop is drawn): one file, so the picture and the play never drift apart.  No imports: node tools read it too.
export const PAL = {
  LEN: 5400,
  DOOR_X: 1500, DOOR_W: 176, DOOR_TOP: 148, DOOR_BOT: 352,   // the wooden door in the skull's mouth; its round sun slot is at the door's heart
  SLOT_DY: 118,                                              // the slot's centre: this far above the door's foot
  WALL_X: 1540,                                              // nobody walks past this until the door is open (src/siworld.js stepDoor)
  SKULL_X0: 1100, SKULL_X1: 1900,                            // the skull's face on the cliff
  CORR_X: 1900, HALL_X: 3800,                                // the purple corridor and the throne hall begin
  THRONE_X: 5160, CRYSTAL_X: 4900, CRYSTAL_Y: 196, MIRROR_X: 5330,
  ROPE_X: 4720,                                              // the rafter rope that drops for Scarlet's swing (world x)
  CAM_BOSS: 4440,
};
