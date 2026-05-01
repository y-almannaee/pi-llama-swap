export interface ISingleModel {
  name: string;
  model: string;
  modified_at: string;
  size: string;
  digest: string;
  type: string;
  description: string;
  tags: string[];
  capabilities: string[];
  parameters: string;
  details: {
    parent_model: string;
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

export interface ISingleProps {
  default_generation_settings: Record<string, any>;
  total_slots: number;
  model_alias: string;
  model_path: string;
  modalities: {
    vision: boolean;
    audio: boolean;
  };
  media_marker: string;
  endpoint_slots: boolean;
  endpoint_props: boolean;
  endpoint_metrics: boolean;
  webui: boolean;
  webui_settings: Record<string, any>;
  chat_template: string;
  chat_template_caps: Record<string, boolean>;
  bos_token: string;
  eos_token: string;
  build_info: string;
  is_sleeping: boolean;
}
