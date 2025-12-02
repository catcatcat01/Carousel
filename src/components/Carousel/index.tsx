import './style.scss';
import React, { useMemo } from 'react';
import { dashboard, bitable, DashboardState, FieldType, IAttachmentField, IFieldMeta, ITable } from "@lark-base-open/js-sdk";
import { Button, Select, InputNumber, Switch } from '@douyinfe/semi-ui';
import { useState, useEffect, useRef, useCallback } from 'react';
import classnames from 'classnames';
import { useTranslation } from 'react-i18next';
import { Item } from '../Item';
import { ColorPicker } from '../ColorPicker';
import { useConfig } from '../../hooks';
import dayjs from 'dayjs';

interface ICarouselConfig {
  tableId?: string;
  viewId?: string;
  titleFieldId?: string;
  descFieldId?: string;
  imageFieldId?: string;
  timeFieldId?: string;
  latestFirst?: boolean;
  preferViewOrder?: boolean;
  limit: number;
  intervalMs: number;
  refreshMs: number;
  color: string;
  showIndicators: boolean;
}

interface ISlide {
  id: string;
  title: string;
  desc?: string;
  imageUrl?: string;
}

export default function Carousel(props: { bgColor: string }) {
  const { t } = useTranslation();
  const [config, setConfig] = useState<ICarouselConfig>({
    limit: 10,
    intervalMs: 3000,
    refreshMs: 8000,
    color: 'var(--ccm-chart-N700)',
    showIndicators: true,
    latestFirst: true,
    preferViewOrder: true,
  });

  const isCreate = dashboard.state === DashboardState.Create;
  const isConfig = dashboard.state === DashboardState.Config || isCreate;

  const timer = useRef<any>();
  const updateConfig = (res: any) => {
    if (timer.current) {
      clearTimeout(timer.current);
    }
    const { customConfig } = res || {};
    if (customConfig) {
      const normalize = (v?: string) => (v === 'undefined' || v === 'null' || v === '' ? undefined : v);
      const cfg = customConfig as ICarouselConfig;
      setConfig({
        ...cfg,
        tableId: normalize(cfg.tableId),
        viewId: normalize(cfg.viewId),
        titleFieldId: normalize(cfg.titleFieldId),
        descFieldId: normalize(cfg.descFieldId),
        imageFieldId: normalize(cfg.imageFieldId),
      });
      timer.current = setTimeout(() => {
        dashboard.setRendered();
      }, 3000);
    }
  };

  useConfig(updateConfig);

  return (
    <main style={{ backgroundColor: props.bgColor }} className={classnames({ 'main-config': isConfig, 'main': true })}>
      <div className='content'>
        <CarouselView config={config} isConfig={isConfig} />
      </div>
      {isConfig && <ConfigPanel t={t} config={config} setConfig={setConfig} />}
    </main>
  );
}

function CarouselView({ config, isConfig }: { config: ICarouselConfig, isConfig: boolean }) {
  const { t } = useTranslation();
  const [slides, setSlides] = useState<ISlide[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const playRef = useRef<any>();
  const playTimeout = useRef<any>();
  const refreshRef = useRef<any>();
  const lastIdsRef = useRef<string[]>([]);
  const cacheRef = useRef<Record<string, ISlide>>({});

  const color = config.color || 'var(--ccm-chart-N700)';

  const toPlainText = (val: any): string => {
    if (val === null || val === undefined) return '';
    const type = typeof val;
    if (type === 'string') {
      const s = (val as string).trim();
      if ((s.startsWith('[') && s.endsWith(']')) || (s.startsWith('{') && s.endsWith('}'))) {
        try {
          return toPlainText(JSON.parse(s));
        } catch {
          return s;
        }
      }
      return s;
    }
    if (type === 'number' || type === 'boolean') return String(val);
    if (Array.isArray(val)) {
      const parts = val.map((item) => {
        if (item === null || item === undefined) return '';
        const it = typeof item;
        if (it === 'string' || it === 'number' || it === 'boolean') return String(item);
        if (it === 'object') {
          if ('text' in item && item.text != null) return String((item as any).text);
          if ('name' in item && item.name != null) return String((item as any).name);
          if ('title' in item && item.title != null) return String((item as any).title);
          if ('value' in item && item.value != null) return String((item as any).value);
        }
        return '';
      }).filter(Boolean);
      return parts.join(' ');
    }
    if (type === 'object') {
      const obj = val as any;
      if ('text' in obj && obj.text != null) return String(obj.text);
      if ('name' in obj && obj.name != null) return String(obj.name);
      if ('title' in obj && obj.title != null) return String(obj.title);
      if ('value' in obj && obj.value != null) return String(obj.value);
      try { return JSON.stringify(val); } catch { return ''; }
    }
    return String(val);
  };

  const pickAttachmentUrl = (val: any): string | undefined => {
    if (val == null) return undefined;
    const arr = Array.isArray(val) ? val : [val];
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const cand = (item as any).thumbnailUrl
        || (item as any).thumbnail_url
        || (item as any).previewUrl
        || (item as any).preview_url
        || (item as any).picUrl
        || (item as any).url
        || (item as any).fsUrl
        || (item as any).fs_url;
      if (typeof cand === 'string' && cand) return cand;
    }
    return undefined;
  };

  const toTimestamp = (val: any): number => {
    if (val === null || val === undefined) return 0;
    const type = typeof val;
    if (type === 'number') return val as number;
    if (type === 'string') {
      const s = (val as string).trim();
      const d = dayjs(s);
      if (d.isValid()) return d.valueOf();
      const n = Number(s);
      return isNaN(n) ? 0 : n;
    }
    if (Array.isArray(val)) return toTimestamp(toPlainText(val));
    if (type === 'object') {
      const obj = val as any;
      if ('value' in obj && obj.value != null) return toTimestamp(obj.value);
      if ('text' in obj && obj.text != null) return toTimestamp(obj.text);
      if ('name' in obj && obj.name != null) return toTimestamp(obj.name);
      if ('title' in obj && obj.title != null) return toTimestamp(obj.title);
      return 0;
    }
    return 0;
  };

  const loadData = async () => {
    try {
      setLoading(true);
      let table: ITable | null = null;
      if (config.tableId) table = await bitable.base.getTableById(config.tableId);
      if (!table) table = await bitable.base.getActiveTable();

      const selection = await bitable.base.getSelection();
      const viewId = config.viewId || selection.viewId || undefined;

      let recordIds: string[] = [];
      try {
        if (viewId && (table as any).getView) {
          const view = await (table as any).getView(viewId);
          recordIds = await (view as any).getRecordIdList();
        }
      } catch (_) {}
      if (!recordIds.length) {
        recordIds = await (table as any).getRecordIdList();
      }

      const allFieldMeta: IFieldMeta[] = await (table as any).getFieldMetaList();
      const titleFieldId = config.titleFieldId || allFieldMeta.find(v => v.isPrimary)?.id;
      const descFieldId = config.descFieldId;
      const imageFieldId = config.imageFieldId;
      const timeFieldId = config.timeFieldId;

      let titleField: any = null;
      let descField: any = null;
      let imageField: IAttachmentField | null = null;
      let timeField: any = null;
      try {
        if (titleFieldId) titleField = await (table as any).getField(titleFieldId);
      } catch (e) {}
      try {
        if (descFieldId) descField = await (table as any).getField(descFieldId);
      } catch (e) {}
      try {
        if (imageFieldId) imageField = await (table as any).getField(imageFieldId) as IAttachmentField;
      } catch (e) {}
      try {
        if (timeFieldId) timeField = await (table as any).getField(timeFieldId);
      } catch (e) {}

      let sortedIds = recordIds.slice();
      const useViewOrderFast = !!config.preferViewOrder && !!viewId;
      if (timeField && !useViewOrderFast) {
        const pairs: { id: string, ts: number }[] = await Promise.all(sortedIds.map(async (rid) => {
          let ts = 0;
          try {
            const v = await (timeField as any).getValue(rid);
            ts = toTimestamp(v);
          } catch (_) {}
          return { id: rid, ts };
        }));
        pairs.sort((a, b) => (config.latestFirst ? b.ts - a.ts : a.ts - b.ts));
        sortedIds = pairs.map(p => p.id);
      } else if (useViewOrderFast) {
        sortedIds = recordIds.slice();
        if (!config.latestFirst) {
          sortedIds.reverse();
        }
      }
      const takeIds = sortedIds.slice(0, Math.max(1, config.limit || 10));

      const idsChanged = !(lastIdsRef.current.length === takeIds.length && lastIdsRef.current.every((id, i) => id === takeIds[i]));
      const cachedNow: ISlide[] = takeIds.map(rid => cacheRef.current[rid]).filter(Boolean) as ISlide[];
      if (cachedNow.length) {
        lastIdsRef.current = takeIds.slice();
        setSlides(cachedNow);
        setIndex(v => idsChanged ? 0 : Math.min(v, cachedNow.length ? cachedNow.length - 1 : 0));
        setLoading(false);
      } else {
        const firstId = takeIds[0];
        let firstSlide: ISlide = { id: firstId, title: '', desc: '', imageUrl: undefined };
        try {
          let title = '';
          let desc = '';
          let imageUrl: string | undefined = undefined;
          if (firstId) {
            const tasks: Promise<void>[] = [];
            tasks.push((async () => {
              if (titleField) {
                try { const val = await (titleField as any).getValue(firstId); title = toPlainText(val); } catch (_) {}
              }
            })());
            tasks.push((async () => {
              if (descField) {
                try { const val = await (descField as any).getValue(firstId); desc = toPlainText(val); } catch (_) {}
              }
            })());
            tasks.push((async () => {
              if (imageField) {
                try {
                  const raw = await (imageField as any).getValue(firstId);
                  imageUrl = pickAttachmentUrl(raw);
                  if (!imageUrl) {
                    try {
                      const urls: string[] = await imageField.getAttachmentUrls(firstId);
                      imageUrl = urls && urls.length ? urls[0] : undefined;
                    } catch (_) {}
                  }
                } catch (_) {}
              }
            })());
            await Promise.all(tasks);
            firstSlide = { id: firstId, title, desc, imageUrl };
            cacheRef.current[firstId] = firstSlide;
          }
          if (firstSlide.imageUrl) {
            await new Promise<void>((resolve) => {
              const img = new Image();
              img.decoding = 'async' as any;
              img.onload = () => resolve();
              img.onerror = () => resolve();
              img.src = firstSlide.imageUrl as string;
            });
          }
        } catch (_) {}
        lastIdsRef.current = takeIds.slice();
        setSlides(firstSlide.id ? [firstSlide] : []);
        setIndex(0);
        setLoading(false);
      }

      const result: ISlide[] = await Promise.all(takeIds.map(async (rid) => {
        const cached = cacheRef.current[rid];
        if (cached) return cached;
        try {
          let title = '';
          let desc = '';
          let imageUrl: string | undefined = undefined;

          await Promise.all([
            (async () => {
              if (titleField) {
                try {
                  const val = await (titleField as any).getValue(rid);
                  title = toPlainText(val);
                } catch (_) {}
              }
            })(),
            (async () => {
              if (descField) {
                try {
                  const val = await (descField as any).getValue(rid);
                  desc = toPlainText(val);
                } catch (_) {}
              }
            })(),
            (async () => {
              if (imageField) {
                try {
                  const raw = await (imageField as any).getValue(rid);
                  imageUrl = pickAttachmentUrl(raw);
                  if (!imageUrl) {
                    try {
                      const urls: string[] = await imageField.getAttachmentUrls(rid);
                      imageUrl = urls && urls.length ? urls[0] : undefined;
                    } catch (_) {}
                  }
                } catch (_) {}
              }
            })(),
          ]);

          const slide = { id: rid, title, desc, imageUrl };
          cacheRef.current[rid] = slide;
          return slide;
        } catch (_) {
          return { id: rid, title: '', desc: '', imageUrl: undefined };
        }
      }));
      const same = lastIdsRef.current.length === takeIds.length && lastIdsRef.current.every((id, i) => id === takeIds[i]);
      lastIdsRef.current = takeIds.slice();
      setSlides(result);
      if (!same) {
        setIndex(0);
      } else {
        setIndex(v => Math.min(v, result.length ? result.length - 1 : 0));
      }
      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    if (refreshRef.current) clearInterval(refreshRef.current);
    refreshRef.current = setInterval(loadData, Math.max(3000, config.refreshMs || 8000));
    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current);
    };
  }, [config.tableId, config.viewId, config.titleFieldId, config.descFieldId, config.imageFieldId, config.limit, config.refreshMs]);

  const preloadedRef = useRef<Record<string, boolean>>({});
  useEffect(() => {
    if (!slides.length) return;
    const candidates: (string | undefined)[] = [];
    const next = (index + 1) % slides.length;
    const next2 = (index + 2) % slides.length;
    candidates.push(slides[index]?.imageUrl);
    candidates.push(slides[next]?.imageUrl);
    if (slides.length > 2) candidates.push(slides[next2]?.imageUrl);
    for (const url of candidates) {
      if (url && !preloadedRef.current[url]) {
        const img = new Image();
        img.decoding = 'async' as any;
        img.onload = () => { preloadedRef.current[url!] = true; };
        img.onerror = () => { preloadedRef.current[url!] = false; };
        img.src = url as string;
      }
    }
  }, [slides, index]);

  const planNext = useCallback(() => {
    const delay = Math.max(500, config.intervalMs || 3000);
    if (!slides.length) return;
    const next = (index + 1) % slides.length;
    clearTimeout(playTimeout.current);
    const target = slides[next];
    if (target.imageUrl) {
      const url = target.imageUrl as string;
      if (preloadedRef.current[url]) {
        playTimeout.current = setTimeout(() => {
          setIndex(next);
          planNext();
        }, delay);
      } else {
        const img = new Image();
        let proceeded = false;
        const proceed = () => {
          if (proceeded) return;
          proceeded = true;
          setIndex(next);
          playTimeout.current = setTimeout(planNext, delay);
        };
        img.decoding = 'async' as any;
        img.onload = proceed;
        img.onerror = proceed;
        img.src = url;
      }
    } else {
      playTimeout.current = setTimeout(() => {
        setIndex(next);
        planNext();
      }, delay);
    }
  }, [slides, index, config.intervalMs]);

  useEffect(() => {
    clearTimeout(playTimeout.current);
    if (slides.length) {
      playTimeout.current = setTimeout(planNext, Math.max(500, config.intervalMs || 3000));
    }
    return () => {
      clearTimeout(playTimeout.current);
    };
  }, [slides.length, config.intervalMs, planNext]);

  if (loading && !slides.length) {
    return (
      <div className='carousel-loading'>
        <div className='carousel-title' style={{ color }}>加载中...</div>
      </div>
    );
  }
  if (!slides.length) {
    return (
      <div className='carousel-container'>
        <div className='carousel-slide'>
          <div className='carousel-title' style={{ color }}>{t('carousel.preview.empty')}</div>
        </div>
      </div>
    );
  }

  const current = slides[index];

  return (
    <div className='carousel-container'>
      <div className='carousel-slide' style={{ color }}>
        {current.imageUrl ? <img className='carousel-image' src={current.imageUrl} decoding='async' loading='eager' {...({ fetchpriority: 'high' } as any)} /> : null}
        {current.title ? <div className='carousel-title'>{current.title}</div> : null}
        {current.desc ? <div className='carousel-desc'>{current.desc}</div> : null}
      </div>
      {config.showIndicators ? (
        <div className='carousel-indicators'>
          {slides.map((_, i) => (
            <div key={i} className={classnames('indicator-dot', { 'indicator-dot-active': i === index })}></div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ConfigPanel({ t, config, setConfig }: { t: any, config: ICarouselConfig, setConfig: React.Dispatch<React.SetStateAction<ICarouselConfig>> }) {
  const [tables, setTables] = useState<{ label: string, value: string }[]>([]);
  const [views, setViews] = useState<{ label: string, value: string }[]>([]);
  const [fields, setFields] = useState<IFieldMeta[]>([]);

  useEffect(() => {
    bitable.base.getTableList().then(async (list: any[]) => {
      const options = await Promise.all(list.map(async (t) => ({ label: await t.getName(), value: (await t.getMeta()).id })));
      setTables(options);
    });
  }, []);

  useEffect(() => {
    const load = async () => {
      let table: any = null;
      if (config.tableId) table = await bitable.base.getTableById(config.tableId);
      if (!table) table = await bitable.base.getActiveTable();
      try {
        const vList = await (table as any).getViewList();
        const vOpts = await Promise.all(vList.map(async (v: any) => ({ label: await v.getName(), value: await v.id })));
        setViews(vOpts);
      } catch (_) {
        const sel = await bitable.base.getSelection();
        setViews(sel.viewId ? [{ label: sel.viewId, value: sel.viewId }] : []);
      }
      const metas: IFieldMeta[] = await (table as any).getFieldMetaList();
      setFields(metas);
    };
    load();
  }, [config.tableId]);

  const fieldOptions = useMemo(() => fields.map(f => ({ label: f.name, value: f.id })), [fields]);
  const imageFieldOptions = useMemo(() => fields.filter(f => f.type === FieldType.Attachment).map(f => ({ label: f.name, value: f.id })), [fields]);
  const timeFieldOptions = useMemo(() => fields.map(f => ({ label: f.name, value: f.id })), [fields]);

  const onSaveConfig = () => {
    dashboard.saveConfig({
      customConfig: config,
      dataConditions: [],
    } as any);
  };

  return (
    <div className='config-panel'>
      <div className='form'>
        <Item label={t('carousel.label.table')}>
          <Select value={config.tableId} optionList={tables} onChange={(v) => setConfig({ ...config, tableId: v == null ? undefined : String(v) })} style={{ width: '100%' }} />
        </Item>
        <Item label={t('carousel.label.view')}>
          <Select value={config.viewId} optionList={views} onChange={(v) => setConfig({ ...config, viewId: v == null ? undefined : String(v) })} style={{ width: '100%' }} />
        </Item>
        <Item label={'遵循视图排序(更快)'}>
          <Switch checked={!!config.preferViewOrder} onChange={(v) => setConfig({ ...config, preferViewOrder: !!v })} />
        </Item>
        <Item label={'时间字段'}>
          <Select value={config.timeFieldId} optionList={timeFieldOptions} onChange={(v) => setConfig({ ...config, timeFieldId: v == null ? undefined : String(v) })} style={{ width: '100%' }} />
        </Item>
        <Item label={'最新优先'}>
          <Switch checked={!!config.latestFirst} onChange={(v) => setConfig({ ...config, latestFirst: !!v })} />
        </Item>
        <Item label={t('carousel.label.titleField')}>
          <Select value={config.titleFieldId} optionList={fieldOptions} onChange={(v) => setConfig({ ...config, titleFieldId: v == null ? undefined : String(v) })} style={{ width: '100%' }} />
        </Item>
        <Item label={t('carousel.label.descField')}>
          <Select value={config.descFieldId} optionList={fieldOptions} onChange={(v) => setConfig({ ...config, descFieldId: v == null ? undefined : String(v) })} style={{ width: '100%' }} />
        </Item>
        <Item label={t('carousel.label.imageField')}>
          <Select value={config.imageFieldId} optionList={imageFieldOptions} onChange={(v) => setConfig({ ...config, imageFieldId: v == null ? undefined : String(v) })} style={{ width: '100%' }} />
        </Item>
        <Item label={t('carousel.label.limit')}>
          <InputNumber value={config.limit} min={1} max={50} onChange={(v) => setConfig({ ...config, limit: Number(v) || 10 })} style={{ width: '100%' }} />
        </Item>
        <Item label={t('carousel.label.interval')}>
          <InputNumber value={config.intervalMs} min={1000} max={60000} step={500} onChange={(v) => setConfig({ ...config, intervalMs: Number(v) || 3000 })} style={{ width: '100%' }} />
        </Item>
        <Item label={t('carousel.label.refresh')}>
          <InputNumber value={config.refreshMs} min={3000} max={120000} step={1000} onChange={(v) => setConfig({ ...config, refreshMs: Number(v) || 8000 })} style={{ width: '100%' }} />
        </Item>
        <Item label={t('label.color')}>
          <ColorPicker value={config.color} onChange={(v) => setConfig({ ...config, color: v })} />
        </Item>
        <Item label={t('carousel.label.indicator')}>
          <Switch checked={config.showIndicators} onChange={(v) => setConfig({ ...config, showIndicators: !!v })} />
        </Item>
      </div>
      <Button className='btn' theme='solid' onClick={onSaveConfig}>{t('confirm')}</Button>
    </div>
  );
}
