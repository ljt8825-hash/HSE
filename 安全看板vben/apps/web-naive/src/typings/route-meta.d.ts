import 'vue-router';

// HSE-MOBILE-GRID-01-B：为自定义移动端布局补充路由元信息键。
// Vben 的 generateAccessible（@vben/access）在 route.meta.noBasicLayout 为 true 时，
// 会将该路由通过 router.addRoute 作为顶层路由挂载，从而脱离 PC 端 BasicLayout 框架。
// 该键在 @vben 内部以可选链读取，此处补齐类型声明，避免新增路由时触发类型错误。
declare module 'vue-router' {
  interface RouteMeta {
    /** 脱离 BasicLayout，使用自定义布局（移动端壳层） */
    noBasicLayout?: boolean;
  }
}
