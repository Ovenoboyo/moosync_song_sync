import { Playlist, Song } from '@moosync/moosync-types'
import { readFile, writeFile } from 'fs/promises'
import { GenericProvider } from './genericProvider'

export class FileProvider extends GenericProvider {
  private filePath: string

  private writeQueue: (() => Promise<StoredData>)[] = []
  private isWriting = false

  constructor(filePath: string) {
    super()
    this.filePath = filePath
  }

  private async readFile(): Promise<StoredData> {
    try {
      const data = await readFile(this.filePath, { encoding: 'utf-8' })
      const parsed = JSON.parse(data)
      return this.validateStoredData(parsed)
    } catch (e) {
      console.error('Failed to parse data from file. Discarding.')
      return {
        playlists: [],
        songs: []
      }
    }
  }

  private async drainWriteQueue() {
    const queue = this.writeQueue.slice()
    for (const m of queue) {
      this.writeQueue.splice(this.writeQueue.indexOf(m), 1)
      const data = await m()
      await this.dumpFile(data)
    }
  }

  private async dumpOrAddToQueue(method: () => Promise<StoredData>) {
    if (this.isWriting) {
      this.writeQueue.push(method)
    } else {
      this.isWriting = true

      const data = await method()
      await this.dumpFile(data)

      while (this.writeQueue.length > 0) {
        await this.drainWriteQueue()
      }

      this.isWriting = false
    }
  }

  private async dumpFile(data: StoredData) {
    try {
      console.trace('writing', JSON.stringify(data))
      await writeFile(this.filePath, JSON.stringify(data), { flag: 'w' })
    } catch (e) {
      console.error('Failed to dump file', e)
    }
  }

  async storeSongs(overwrite: boolean, ...songs: Song[]) {
    this.dumpOrAddToQueue(async () => {
      const data = await this.readFile()

      if (!overwrite) {
        for (const s of songs) {
          if (!data.songs.find((val) => val._id === s._id)) {
            data.songs.push(s)
          }
        }
      } else {
        data.songs = songs
      }

      return data
    })
  }

  protected async storePlaylists(overwrite: boolean, ...playlists: Playlist[]): Promise<void> {
    this.dumpOrAddToQueue(async () => {
      const data = await this.readFile()

      if (!overwrite) {
        for (const s of playlists) {
          if (!data.playlists.find((val) => val.playlist_id === s.playlist_id)) {
            data.playlists.push(s)
          }
        }
      } else {
        data.playlists = playlists
      }

      return data
    })
  }

  protected async removePlaylists(...playlists: Playlist[]): Promise<void> {
    this.dumpOrAddToQueue(async () => {
      const data = await this.readFile()
      for (const p of playlists) {
        const index = data.playlists.findIndex((val) => val.playlist_id === p.playlist_id)
        if (index !== -1) {
          data.playlists.splice(index, 1)
        }
      }

      return data
    })
  }

  async removeSongs(...songs: Song[]) {
    this.dumpOrAddToQueue(async () => {
      const data = await this.readFile()
      for (const s of songs) {
        const index = data.songs.findIndex((val) => val._id === s._id)
        if (index !== -1) {
          data.songs.splice(index, 1)
        }
      }

      return data
    })
  }

  async getSongs(): Promise<Song[]> {
    const data = await this.readFile()
    return data.songs
  }

  async getPlaylists(): Promise<Playlist[]> {
    const data = await this.readFile()
    return data.playlists
  }
}

// new FileProvider(path.resolve(__dirname, 'fileSync')).storeSong(false, {
//   _id: 'rjkj',
//   title: 'dhjkfh',
//   duration: 69,
//   playbackUrl: 'fjikd',
//   type: 'YOUTUBE',
//   date_added: Date.now()
// })
