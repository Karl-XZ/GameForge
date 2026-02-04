"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, Button } from "@/components/ui";
import type { SideScrollerPlan } from "@/lib/schemas";

type PhaserType = typeof import("phaser");

export function SideScrollerPlayer({ data }: { data: SideScrollerPlan }) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const gameRef = React.useRef<any>(null);
  const [running, setRunning] = React.useState(false);

  const level = Array.isArray(data?.levels) && data.levels[0] ? data.levels[0] : null;

  const start = React.useCallback(async () => {
    if (!containerRef.current || running) return;

    const PhaserMod: PhaserType = (await import("phaser")) as any;
    const Phaser: any = (PhaserMod as any).default ?? PhaserMod;

    containerRef.current.innerHTML = "";

    const WIDTH = 900;
    const HEIGHT = 520;

    class MainScene extends Phaser.Scene {
      cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
      keyZ!: Phaser.Input.Keyboard.Key;
      player!: Phaser.Physics.Arcade.Sprite;
      platforms!: Phaser.Physics.Arcade.StaticGroup;
      enemies!: Phaser.Physics.Arcade.Group;
      attackCooldown = 0;

      create() {
        this.cameras.main.setBackgroundColor("#070a12");

        const g = this.add.graphics();
        g.fillStyle(0x7c3aed, 1);
        g.fillRoundedRect(0, 0, 36, 48, 6);
        g.generateTexture("player", 36, 48);
        g.clear();

        g.fillStyle(0x22c55e, 1);
        g.fillRoundedRect(0, 0, 28, 28, 8);
        g.generateTexture("enemy", 28, 28);
        g.clear();

        g.fillStyle(0x334155, 1);
        g.fillRect(0, 0, 200, 24);
        g.generateTexture("platform", 200, 24);
        g.destroy();

        this.physics.world.setBounds(0, 0, 2200, HEIGHT);

        this.platforms = this.physics.add.staticGroup();
        for (let x = 0; x < 2200; x += 200) {
          this.platforms.create(x + 100, HEIGHT - 20, "platform").refreshBody();
        }

        const extra = Array.isArray(level?.platformLayout) ? level.platformLayout : [];
        extra.slice(0, 12).forEach((p: any) => {
          const px = clampNum(p.x, 0, 1) * 2000 + 100;
          const py = 80 + clampNum(p.y, 0, 1) * 320;
          const w = 100 + clampNum(p.width, 0.05, 0.8) * 380;
          const platform = this.platforms.create(px, py, "platform");
          platform.setScale(w / 200, 1).refreshBody();
        });

        this.player = this.physics.add.sprite(120, HEIGHT - 120, "player");
        this.player.setCollideWorldBounds(true);
        this.player.setBounce(0.05);
        this.player.setDragX(900);
        this.player.setMaxVelocity(260, 650);

        this.physics.add.collider(this.player, this.platforms);

        this.enemies = this.physics.add.group({
          bounceX: 1,
          bounceY: 0.2,
          collideWorldBounds: true,
        });

        for (let i = 0; i < 6; i++) {
          const e = this.enemies.create(600 + i * 260, HEIGHT - 120, "enemy") as Phaser.Physics.Arcade.Sprite;
          e.setVelocityX((i % 2 === 0 ? 1 : -1) * 80);
        }

        this.physics.add.collider(this.enemies, this.platforms);
        this.physics.add.collider(this.enemies, this.enemies);

        this.physics.add.overlap(this.player, this.enemies, () => {
          const vx = (this.player.x < 1100 ? -1 : 1) * 120;
          this.player.setVelocityX(vx);
        });

        this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
        this.cameras.main.setBounds(0, 0, 2200, HEIGHT);

        this.cursors = this.input.keyboard!.createCursorKeys();
        this.keyZ = this.input.keyboard!.addKey("Z");

        const goalX = 2050;
        const goal = this.add.rectangle(goalX, HEIGHT - 120, 32, 140, 0x38bdf8, 0.85);
        this.physics.add.existing(goal, true);
        this.physics.add.overlap(this.player, goal as any, () => {
          this.add
            .text(this.player.x - 90, 50, "到达终点！", { fontFamily: "ui-sans-serif", fontSize: "20px" })
            .setScrollFactor(0)
            .setDepth(10);
        });

        this.add
          .text(16, 16, `${data.title}\n${data.elevatorPitch}`, {
            fontFamily: "ui-sans-serif",
            fontSize: "14px",
            color: "#e2e8f0",
          })
          .setScrollFactor(0)
          .setDepth(10);
      }

      update(_: number, dt: number) {
        const body = this.player.body as Phaser.Physics.Arcade.Body;
        const onGround = body.blocked.down || body.touching.down;

        if (this.cursors.left?.isDown) {
          this.player.setAccelerationX(-900);
          this.player.setFlipX(true);
        } else if (this.cursors.right?.isDown) {
          this.player.setAccelerationX(900);
          this.player.setFlipX(false);
        } else {
          this.player.setAccelerationX(0);
        }

        if (this.cursors.up?.isDown && onGround) {
          this.player.setVelocityY(-420);
        }

        this.attackCooldown = Math.max(0, this.attackCooldown - dt);
        if (this.keyZ.isDown && this.attackCooldown === 0) {
          this.attackCooldown = 500;
          this.enemies.children.iterate((child: any) => {
            const e = child as any;
            const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y);
            if (dist < 90) {
              e.setVelocityX((e.x < this.player.x ? -1 : 1) * 240);
              e.setVelocityY(-180);
            }
            return true;
          });
        }
      }
    }

    const config: any = {
      type: Phaser.AUTO,
      width: WIDTH,
      height: HEIGHT,
      parent: containerRef.current,
      physics: {
        default: "arcade",
        arcade: { gravity: { y: 980 }, debug: false },
      },
      scene: MainScene,
    };

    gameRef.current = new Phaser.Game(config);
    setRunning(true);
  }, [data, level, running]);

  const stop = React.useCallback(() => {
    try {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    } catch {}
    if (containerRef.current) containerRef.current.innerHTML = "";
    setRunning(false);
  }, []);

  React.useEffect(() => {
    if (running) {
      stop();
      setTimeout(() => start(), 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(data)]);

  return (
    <Card className="bg-panel/60">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-lg">{data.title}</CardTitle>
            <p className="mt-1 text-xs text-text/70">{data.artStyle}</p>
          </div>
          <div className="flex gap-2">
            {running ? (
              <Button variant="ghost" onClick={stop}>停止</Button>
            ) : (
              <Button variant="primary" onClick={start}>开始试玩</Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border border-border bg-panel2 p-4 text-sm text-text/85">
          <div className="font-medium mb-1">目标</div>
          <div className="whitespace-pre-wrap">{level?.objective ?? "到达关卡终点"}</div>
          <div className="mt-3 text-xs text-text/70">
            操作：←/→ 移动，↑ 跳跃，Z 攻击。
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border">
          <div ref={containerRef} className="bg-black" />
        </div>
      </CardContent>
    </Card>
  );
}

function clampNum(v: any, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
