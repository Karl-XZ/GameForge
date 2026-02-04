import { z } from "zod";

export const TextAdventureOutlineSchema = z.object({
  title: z.string().min(1),
  language: z.enum(["zh", "en"]),
  setting: z.string().min(1),
  tone: z.string().min(1),
  playerRole: z.string().min(1),
  premise: z.string().min(1),
  keyBeats: z.array(z.string().min(1)).min(4),
  npcs: z
    .array(
      z.object({
        name: z.string().min(1),
        role: z.string().min(1),
        description: z.string().min(1),
      })
    )
    .min(2),
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        description: z.string().min(1),
      })
    )
    .optional()
    .default([]),
  endings: z
    .array(
      z.object({
        type: z.enum(["win", "fail", "neutral"]),
        summary: z.string().min(1),
      })
    )
    .min(2),
});

export const TextAdventureSceneSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  text: z.string().min(1),
  cgPrompt: z.string().min(1),
  isEnding: z.boolean().optional().default(false),
  endingType: z.enum(["win", "fail", "neutral"]).optional(),
  endingText: z.string().optional().default(""),
  choices: z
    .array(
      z.object({
        text: z.string().min(1),
        nextSceneId: z.string().min(1),
        consequence: z.string().optional().default(""),
      })
    )
    .min(0)
    .max(5)
    .default([]),
});

export const TextAdventureScenesSchema = z.object({
  title: z.string().min(1),
  language: z.enum(["zh", "en"]),
  setting: z.string().min(1),
  tone: z.string().min(1),
  startingSceneId: z.string().min(1),
  scenes: z.array(TextAdventureSceneSchema).min(6),
});

const PlatformSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
});

export const SideScrollerLevelSchema = z.object({
  name: z.string().min(1),
  theme: z.string().min(1),
  objective: z.string().min(1),
  platformLayout: z.array(PlatformSchema).max(20).optional().default([]),
  setPieces: z.array(z.string().min(1)).min(2),
});

export const SideScrollerAssetSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "player",
    "enemy",
    "npc",
    "item",
    "effect",
    "ui",
    "background",
    "platform",
    "prop",
    "tile",
    "projectile",
    "other",
  ]),
  prompt: z.string().min(1),
  needsCutout: z.boolean(),
  tags: z.array(z.string().min(1)).optional().default([]),
});

const NonEmptyString = z.string().min(1);
const InputString = z.preprocess((val) => {
  if (typeof val === "string" && val.trim().length > 0) return val;
  return "TBD";
}, z.string().min(1));

export const SideScrollerPlanSchema = z.object({
  title: z.string().min(1),
  language: z.enum(["zh", "en"]),
  elevatorPitch: NonEmptyString,
  artStyle: NonEmptyString,
  controls: z.array(NonEmptyString).min(3),
  coreLoop: z.array(NonEmptyString).min(3),
  playerAbilities: z
    .array(
      z.object({
        name: NonEmptyString,
        description: NonEmptyString,
        input: InputString,
      })
    )
    .min(3),
  enemies: z
    .array(
      z.object({
        name: NonEmptyString,
        behavior: NonEmptyString,
        weakness: NonEmptyString,
      })
    )
    .min(3),
  levels: z.array(SideScrollerLevelSchema).min(3),
  balanceNotes: z.string().min(1),
  assets: z.array(SideScrollerAssetSchema).min(6),
});

export type TextAdventureOutline = z.infer<typeof TextAdventureOutlineSchema>;
export type TextAdventureScenes = z.infer<typeof TextAdventureScenesSchema>;
export type TextAdventureScene = z.infer<typeof TextAdventureSceneSchema>;
export type SideScrollerPlan = z.infer<typeof SideScrollerPlanSchema>;
export type SideScrollerAsset = z.infer<typeof SideScrollerAssetSchema>;
export type SideScrollerLevel = z.infer<typeof SideScrollerLevelSchema>;
