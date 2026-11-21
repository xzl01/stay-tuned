/* SPDX-License-Identifier: GPL-3.0-only */

let cardStorage: LocalStorage = new LocalStorage();

/**
 * Home-screen card, the HarmonyOS counterpart of the Android widget: it shows
 * what the receiver is tuned to and whether it is playing. The data is pushed
 * with formBindingData, so the card itself never touches playback state.
 */
@Entry(cardStorage)
@Component
struct StayTunedCard {
  @LocalStorageProp('title') title: string = '留频';
  @LocalStorageProp('artist') artist: string = '还没有在收听';
  @LocalStorageProp('playing') playing: boolean = false;

  build() {
    Column() {
      Row() {
        Text('留频')
          .fontSize(12)
          .fontColor('#7A7D72')
          .letterSpacing(2)
        Blank()
        Text(this.playing ? '播放中' : '已暂停')
          .fontSize(12)
          .fontColor(this.playing ? '#C85235' : '#7A7D72')
      }
      .width('100%')

      Blank()

      Text(this.title)
        .fontSize(18)
        .fontWeight(FontWeight.Medium)
        .fontColor('#2E312B')
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .width('100%')

      Text(this.artist)
        .fontSize(13)
        .fontColor('#5C6056')
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .margin({ top: 4 })
        .width('100%')

      Blank()

      Row() {
        Text(this.playing ? '⏸' : '▶')
          .fontSize(14)
          .fontColor('#C85235')
        Text(this.playing ? '在听' : '点按打开留频')
          .fontSize(12)
          .fontColor('#7A7D72')
          .margin({ left: 6 })
        Blank()
      }
      .width('100%')
    }
    .width('100%')
    .height('100%')
    .padding(16)
    .borderRadius(20)
    .backgroundColor('#F7F6F0')
    .onClick(() => {
      postCardAction(this, {
        action: 'router',
        abilityName: 'EntryAbility',
        params: { from: 'card' },
      });
    })
  }
}
