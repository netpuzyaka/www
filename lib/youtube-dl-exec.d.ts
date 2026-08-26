declare module "youtube-dl-exec" {
  type Flags = Record<string, unknown>;
  function youtubedl(url: string, flags?: Flags): Promise<any>;
  export default youtubedl;
}
