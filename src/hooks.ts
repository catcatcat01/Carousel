import { DashboardState, bitable, dashboard } from "@lark-base-open/js-sdk";
import React from "react";
import { useLayoutEffect, useState } from "react";

function updateTheme(theme: string) {
  document.body.setAttribute('theme-mode', theme);
}

/** 跟随主题色变化 */
export function useTheme() {
  const [bgColor, setBgColor] = useState('#ffffff');
  useLayoutEffect(() => {
    dashboard.getTheme().then((res) => {
      setBgColor(res.chartBgColor);
      updateTheme(res.theme.toLocaleLowerCase());
    })

    dashboard.onThemeChange((res) => {
      setBgColor(res.data.chartBgColor);
      updateTheme(res.data.theme.toLocaleLowerCase());
    })
  }, [])
  return {
    bgColor,
  }
}

/** 初始化、更新config */
export function useConfig(updateConfig: (data: any) => void) {

  const isCreate = dashboard.state === DashboardState.Create
  React.useEffect(() => {
    if (isCreate) {
      return
    }
    let active = true
    const tryGet = (delay?: number) => {
      const exec = () => {
        dashboard.getConfig().then((cfg) => {
          if (!active) return
          updateConfig(cfg)
        }).catch(() => {
          if (!active) return
          const nextDelay = Math.min((delay || 200) * 2, 2000)
          setTimeout(() => tryGet(nextDelay), nextDelay)
        })
      }
      if (delay) {
        setTimeout(exec, delay)
      } else {
        exec()
      }
    }
    tryGet()
    return () => {
      active = false
    }
  }, []);


  React.useEffect(() => {
    const offConfigChange = dashboard.onConfigChange((r) => {
      // 监听配置变化，协同修改配置
      updateConfig(r.data);
    });
    return () => {
      offConfigChange();
    }
  }, []);
}
