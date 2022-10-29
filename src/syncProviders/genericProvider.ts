import { Playlist, Song } from '@moosync/moosync-types'

export abstract class GenericProvider {
  protected abstract storeSongs(overwrite: boolean, ...songs: Song[]): Promise<void>
  protected abstract removeSongs(...songs: Song[]): Promise<void>

  protected abstract storePlaylists(overwrite: boolean, ...playlists: Playlist[]): Promise<void>
  protected abstract removePlaylists(...playlists: Playlist[]): Promise<void>

  protected validateStoredData(data: unknown): StoredData {
    let playlists = data['playlists']
    if (typeof data['playlists'] === 'undefined' || !Array.isArray(playlists)) {
      playlists = []
    }

    let songs = data['songs']
    if (typeof data['songs'] === 'undefined' || !Array.isArray(songs)) {
      songs = []
    }

    return {
      playlists,
      songs
    }
  }

  protected sanitizeSongs(...songs: Song[]): Song[] {
    return songs.map((val) => {
      return {
        ...val,
        _id: val._id.replace(`${api.utils.packageName}:`, '')
      }
    })
  }
  protected sanitizePlaylists(...playlists: Playlist[]): Playlist[] {
    return playlists.map((val) => {
      return {
        ...val,
        playlist_id: val.playlist_id.replace(`${api.utils.packageName}:`, '')
      }
    })
  }

  abstract getSongs(): Promise<Song[]>
  abstract getPlaylists(): Promise<Playlist[]>

  async storeSongsSanitized(overwrite: boolean, ...songs: Song[]) {
    await this.storeSongs(overwrite, ...this.sanitizeSongs(...songs))
  }

  async removeSongsSanitized(...songs: Song[]) {
    await this.removeSongs(...this.sanitizeSongs(...songs))
  }

  async storePlaylistsSanitized(overwrite: boolean, ...playlists: Playlist[]) {
    await this.storePlaylists(overwrite, ...this.sanitizePlaylists(...playlists))
  }

  async removePlaylistsSanitized(...playlists: Playlist[]) {
    await this.removePlaylists(...this.sanitizePlaylists(...playlists))
  }
}
