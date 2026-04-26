export interface IRouterModel {
  id: string;
  aliases?: string[];
  tags: string[];
  object: string;
  owned_by: string;
  created: number;
  status: { value: string; args: string[] };
}
