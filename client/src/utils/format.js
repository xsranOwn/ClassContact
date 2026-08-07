// 通用格式化工具

/**
 * 班级名短显示:2024级15班 → 15班(去掉前导年级)。
 * 仅匹配「YYYY级XX班」格式;手动命名的班级(如"一年级三班")原样返回。
 */
export function shortClassName(name) {
  if (!name) return '';
  const s = String(name).trim();
  return s.replace(/^\d{4}级/, '');
}
