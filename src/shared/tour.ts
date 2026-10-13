// 新手引导版本与加载期迁移决策（双端共享的纯逻辑，零依赖，Node 测试直接加载）
// tourVersion 语义：记录用户已读到的引导版本，完成或跳过均写入当时的 TOUR_VERSION；
// 未来引导内容大改需要全员重看时，递增 TOUR_VERSION 即可。

export const TOUR_VERSION = 1

/**
 * 加载 settings.json 时推导 tourVersion 初值，区分新装与老用户升级：
 * - 文件不存在（全新安装）→ 0，首次进入主界面时自动弹引导；
 * - 文件存在但缺字段 / 值非法（引导功能上线前的老用户、手改坏配置）→ TOUR_VERSION，
 *   视为已读，升级后不打扰；
 * - 已有合法值原样保留（引导没走完的新用户是 0，下次启动仍会弹）。
 */
export function resolveInitialTourVersion(fileExists: boolean, parsed: { tourVersion?: unknown }): number {
  if (!fileExists) return 0
  if (
    typeof parsed.tourVersion === 'number' &&
    Number.isFinite(parsed.tourVersion) &&
    parsed.tourVersion >= 0
  ) {
    return parsed.tourVersion
  }
  return TOUR_VERSION
}

/** 是否需要自动弹新手引导（进主界面时调用；tourVersion 缺省按未读处理） */
export function shouldShowTour(settings: { tourVersion?: number }): boolean {
  return (settings.tourVersion ?? 0) < TOUR_VERSION
}
