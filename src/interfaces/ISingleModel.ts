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
