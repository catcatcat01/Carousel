import './style.scss';
import React, { useMemo } from 'react';
import { dashboard, bitable, DashboardState, FieldType, IAttachmentField, IFieldMeta, ITable } from "@lark-base-open/js-sdk";
import { Button, Select, InputNumber, Switch } from '@douyinfe/semi-ui';
import { useState, useEffect, useRef } from 'react';
import classnames from 'classnames';
import { useTranslation } from 'react-i18next';
import { Item } from '../Item';
import { ColorPicker } from '../ColorPicker';
import { useConfig } from '../../hooks';

interface ICarouselConfig {
  tableId?: string;
  viewId?: string;
  titleFieldId?: string;
  descFieldId?: string;
  imageFieldId?: string;
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
  const playRef = useRef<any>();
  const refreshRef = useRef<any>();

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

  const loadData = async () => {
    try {
      let table: ITable | null = null;
      if (config.tableId) table = await bitable.base.getTableById(config.tableId);
      if (!table) table = await bitable.base.getActiveTable();

      const selection = await bitable.base.getSelection();
      const viewId = config.viewId || selection.viewId || undefined;

      let recordIds: string[] = [];
      try {
        if (viewId && (table as any).getView) {
          const view = await (table as any).getView(viewId);
          recordIds = await (view as any).getVisibleRecordIdList();
        }
      } catch (_) {}
      if (!recordIds.length) {
        recordIds = await (table as any).getRecordIdList();
      }

      const allFieldMeta: IFieldMeta[] = await (table as any).getFieldMetaList();
      const titleFieldId = config.titleFieldId || allFieldMeta.find(v => v.isPrimary)?.id;
      const descFieldId = config.descFieldId;
      const imageFieldId = config.imageFieldId;

      let titleField: any = null;
      let descField: any = null;
      let imageField: IAttachmentField | null = null;
      try {
        if (titleFieldId) titleField = await (table as any).getField(titleFieldId);
      } catch (e) {}
      try {
        if (descFieldId) descField = await (table as any).getField(descFieldId);
      } catch (e) {}
      try {
        if (imageFieldId) imageField = await (table as any).getField(imageFieldId) as IAttachmentField;
      } catch (e) {}

      const takeIds = recordIds.slice(0, Math.max(1, config.limit || 10));

      const result: ISlide[] = [];
      for (const rid of takeIds) {
        let title = '';
        let desc = '';
        let imageUrl: string | undefined = undefined;

        if (titleField) {
          try {
            const val = await (titleField as any).getValue(rid);
            title = toPlainText(val);
          } catch (_) {}
        }
        if (descField) {
          try {
            const val = await (descField as any).getValue(rid);
            desc = toPlainText(val);
          } catch (_) {}
        }
        if (imageField) {
          try {
            const urls: string[] = await imageField.getAttachmentUrls(rid);
            imageUrl = urls && urls.length ? urls[0] : undefined;
          } catch (_) {}
        }

        result.push({ id: rid, title, desc, imageUrl });
      }
      setSlides(result);
      setIndex(0);
    } catch (e) {
      console.error(e);
      setSlides([]);
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

  useEffect(() => {
    if (playRef.current) clearInterval(playRef.current);
    playRef.current = setInterval(() => {
      setIndex(v => {
        const next = v + 1;
        if (!slides.length) return 0;
        return next % slides.length;
      });
    }, Math.max(1000, config.intervalMs || 3000));
    return () => {
      if (playRef.current) clearInterval(playRef.current);
    };
  }, [slides.length, config.intervalMs]);

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
        {current.imageUrl ? <img className='carousel-image' src={current.imageUrl} /> : null}
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