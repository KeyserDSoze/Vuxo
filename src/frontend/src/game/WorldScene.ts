import Phaser from 'phaser';

export class WorldScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private readonly baseSpeed = 160;
  private readonly dexterity = 0;

  constructor() {
    super('world');
  }

  create() {
    for (let x = 0; x < 960; x += 32) {
      for (let y = 0; y < 540; y += 32) {
        const shade = ((x / 32 + y / 32) % 2 === 0) ? 0x1e3a8a : 0x1e40af;
        this.add.rectangle(x + 16, y + 16, 31, 31, shade);
      }
    }

    this.player = this.add.rectangle(480, 270, 24, 32, 0xfbbf24);
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  }

  update(_time: number, delta: number) {
    const direction = new Phaser.Math.Vector2(
      (this.cursors.right.isDown || this.wasd.D.isDown ? 1 : 0) - (this.cursors.left.isDown || this.wasd.A.isDown ? 1 : 0),
      (this.cursors.down.isDown || this.wasd.S.isDown ? 1 : 0) - (this.cursors.up.isDown || this.wasd.W.isDown ? 1 : 0)
    );

    if (direction.lengthSq() === 0) return;

    direction.normalize();
    const speedMultiplier = 1 + this.dexterity * 0.10;
    const distance = this.baseSpeed * speedMultiplier * (delta / 1000);
    this.player.x = Phaser.Math.Clamp(this.player.x + direction.x * distance, 12, 948);
    this.player.y = Phaser.Math.Clamp(this.player.y + direction.y * distance, 16, 524);
  }
}
