import { ForwardRequestReturnType, MoosyncExtensionTemplate, Playlist, Song } from '@moosync/moosync-types'
import path from 'path'
import { FileProvider } from './syncProviders/fileProvider'
import { GenericProvider } from './syncProviders/genericProvider'

/**
 * TODO:
 *
 * 1) Store extension icons in local folder
 * 2) Before adding song to library, check if its provider extension exists
 * 3) On song added, check if this extension has provided the same song or not.
 * 4) Add custom return type of extension events to allow forwarding this request to some other extension / provider
 * 5) Add recursion protection for above method
 *
 */
export class OnlineSyncExtension implements MoosyncExtensionTemplate {
  private providers: GenericProvider[] = []

  async onStarted() {
    console.info('Extension started')

    this.providers.push(new FileProvider('/home/ovenoboyo/fileSync'))

    this.registerListeners()

    await this.storeInitialSongsInProvider()
    await this.storeInitialSongsInLibrary()

    await this.storeInitialPlaylistsInProvider()
    await this.storeInitialPlaylistsInLibrary()
  }

  async onStopped() {
    console.info('Extension stopped')
  }

  private async storeInitialSongsInProvider() {
    const songs = await this.getOnlineSongs()
    this.addSongsToProvider(songs, false)
  }

  private async storeInitialPlaylistsInProvider() {
    const playlists = await this.getOnlinePlaylists()
    this.addPlaylistsToProvider(playlists, false)
  }

  private async isSongInLibrary(id: string) {
    const existingSongs = await api.getSongs({
      song: {
        _id: `%${id}`
      }
    })

    for (const e of existingSongs) {
      if (e._id === id || e._id === `${api.utils.packageName}:${id}`) {
        return true
      }
    }

    return false
  }

  private async isPlaylistInLibrary(id: string) {
    const existingPlaylists = await api.getEntity<Playlist>({
      playlist: {
        playlist_id: `%${id}`
      }
    })

    for (const e of existingPlaylists) {
      if (e.playlist_id === id || e.playlist_id === `${api.utils.packageName}:${id}`) {
        return true
      }
    }

    return false
  }

  private async storeInitialSongsInLibrary() {
    const songs = await this.getSongsFromProvider()
    for (const s of songs) {
      const songExists = await this.isSongInLibrary(s._id)
      if (!songExists) {
        await api.addSongs({
          ...s
        })
      }
    }
  }

  private async storeInitialPlaylistsInLibrary() {
    const playlists = await this.getPlaylistsFromProvider()
    for (const p of playlists) {
      const playlistExists = await this.isPlaylistInLibrary(p.playlist_id)
      console.log('exists', playlistExists)
      if (!playlistExists) {
        await api.addPlaylist({
          ...p
        })
      }
    }
  }

  private async addSongsToProvider(songs: Song[], overwrite = false) {
    for (const p of this.providers) {
      await p.storeSongsSanitized(overwrite, ...songs)
    }
  }

  private async removeSongsFromProvider(songs: Song[]) {
    for (const p of this.providers) {
      await p.removeSongsSanitized(...songs)
    }
  }

  private async addPlaylistsToProvider(playlists: Playlist[], overwrite = false) {
    for (const p of this.providers) {
      await p.storePlaylistsSanitized(overwrite, ...playlists)
    }
  }

  private async removePlaylistsFromProvider(playlists: Playlist[]) {
    for (const p of this.providers) {
      await p.removePlaylistsSanitized(...playlists)
    }
  }

  private async getSongsFromProvider() {
    const songs: Song[] = []
    for (const p of this.providers) {
      songs.push(...(await p.getSongs()))
    }

    return songs
  }

  private async getPlaylistsFromProvider() {
    const playlists: Playlist[] = []
    for (const p of this.providers) {
      playlists.push(...(await p.getPlaylists()))
    }

    return playlists
  }

  private matchProvider(id: string, suffix: string) {
    const acceptableIds = [
      `youtube${suffix}:`,
      `spotify${suffix}:`,
      ...api.getInstalledExtensions().map((val) => `${val}:`)
    ]

    const regex = new RegExp(`^${acceptableIds.join('|')}.*$`)
    const match = id.match(regex)
    if (match && match.length > 0) {
      const provider = this.getProviderFromKey(match[0], suffix)
      return { provider, match: match[0] }
    }
  }

  private registerListeners() {
    api.on('songAdded', async (songs) => {
      songs = songs.filter((val) => val.type !== 'LOCAL')
      await this.addSongsToProvider(songs)
    })

    api.on('songRemoved', async (songs) => {
      await this.removeSongsFromProvider(songs)
    })

    api.on('playlistAdded', async (playlists) => {
      await this.addPlaylistsToProvider(this.filterPlaylists(playlists))
    })

    api.on('playlistRemoved', async (playlists) => {
      await this.removePlaylistsFromProvider(playlists)
    })

    api.on('requestedPlaylistSongs', async (playlistId, invalidateCache, nextPageToken) => {
      console.log(playlistId)
      const matched = this.matchProvider(playlistId, '-playlist')
      if (matched) {
        return {
          forwardTo: matched.provider,
          transformedData: [playlistId.replace(matched.match, ''), invalidateCache, nextPageToken]
        }
      }
    })

    api.on('playbackDetailsRequested', async (song) => {
      console.log(song)
      const matched = this.matchProvider(song._id, '')
      console.log('matched', matched)
      if (matched) {
        return {
          forwardTo: matched.provider,
          transformedData: [
            {
              ...song,
              _id: song._id.replace(matched.match, '')
            }
          ]
        }
      }
    })
  }

  private getProviderFromKey(key: string, suffix: string) {
    if (key === `spotify${suffix}:`) {
      return 'spotify'
    }

    if (key === `youtube${suffix}:`) {
      return 'youtube'
    }

    for (const e of api.getInstalledExtensions()) {
      if (key === `${e}:`) {
        return e
      }
    }
  }

  private async getOnlineSongs() {
    return api.getSongs({
      song: {
        type: 'LOCAL'
      },
      invert: true
    })
  }

  private filterPlaylists(playlists: Playlist[]) {
    const acceptableIds = [
      'youtube-playlist:',
      'spotify-playlist:',
      ...api.getInstalledExtensions().map((val) => `${val}:`)
    ]

    return playlists.filter((val) => {
      for (const a of acceptableIds) {
        console.log(a, val.playlist_id, val.playlist_id.startsWith(a))
        if (val.playlist_id.startsWith(a)) return true
      }
      return false
    })
  }

  private async getOnlinePlaylists() {
    const playlists = await api.getEntity<Playlist>({
      playlist: {}
    })

    return this.filterPlaylists(playlists)
  }
}
