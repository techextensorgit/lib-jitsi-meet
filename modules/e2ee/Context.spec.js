import { Context } from './Context';
import { ratchet, importKey } from './crypto-utils';

/*
function hexdump(buffer) {
    const a = new Uint8Array(buffer);
    let s = '';

    for (let i = 0; i < a.byteLength; i++) {
        s += '0x';
        s += a[i].toString(16);
        s += ' ';
    }

    return s.trim();
}
*/

/* TODO: more tests
 * - delta frames
 * - frame header is not encrypted
 * - different sendCounts
 * - different key length
 * - ratcheting in decodeFunction
 * etc
 */
const audioBytes = [ 0xde, 0xad, 0xbe, 0xef ];
const videoBytes = [ 0xde, 0xad, 0xbe, 0xef, 0xde, 0xad, 0xbe, 0xef, 0xde, 0xad, 0xbe, 0xef ];

describe('E2EE Context', () => {
    let sender;
    let receiver;
    const key = new Uint8Array([
        1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    ]);

    beforeEach(() => {
        sender = new Context('sender');
        receiver = new Context('receiver');
    });

    describe('encode function', () => {
        it('with an audio frame', async done => {
            const sendController = {
                enqueue: encodedFrame => {
                    const data = new Uint8Array(encodedFrame.data);

                    // An audio frame will have an overhead of 6 bytes with this counter and key size:
                    //   4 bytes truncated signature, counter (1 byte) and 1 byte trailer.
                    expect(data.byteLength).toEqual(audioBytes.length + 6);

                    // TODO: provide test vector and matcher.
                    done();
                }
            };
            const frame = {
                data: new Uint8Array(audioBytes).buffer,
                type: undefined // type is undefined for audio frames.
            };

            await sender.setKey(key, 0);
            await receiver.setKey(key, 0);
            await sender.encodeFunction(frame, sendController);
        });

        it('with a video frame', async done => {
            const sendController = {
                enqueue: encodedFrame => {
                    const data = new Uint8Array(encodedFrame.data);

                    // A video frame will have an overhead of 12 bytes with this counter and key size:
                    //   10 bytes signature, counter (1 byte) and 1 byte trailer.

                    expect(data.byteLength).toEqual(videoBytes.length + 12);

                    // TODO: provide test vector and matcher.
                    done();
                }
            };
            const frame = {
                data: new Uint8Array(videoBytes).buffer,
                type: 'key'
            };

            await sender.setKey(key, 0);
            await receiver.setKey(key, 0);
            await sender.encodeFunction(frame, sendController);
        });
    });

    describe('end-to-end test', () => {
        it('with an audio frame', async done => {
            await sender.setKey(key, 0);
            await receiver.setKey(key, 0);
            const receiveController = {
                enqueue: encodedFrame => {
                    const data = new Uint8Array(encodedFrame.data);

                    expect(data.byteLength).toEqual(audioBytes.length);
                    expect(Array.from(data)).toEqual(audioBytes);
                    done();
                }
            };
            const sendController = {
                enqueue: encodedFrame => {
                    receiver.decodeFunction(encodedFrame, receiveController);
                }
            };
            const frame = {
                data: new Uint8Array(audioBytes).buffer,
                type: undefined // type is undefined for audio frames.
            };

            await sender.encodeFunction(frame, sendController);
        });

        it('with a video frame', async done => {
            await sender.setKey(key, 0);
            await receiver.setKey(key, 0);
            const receiveController = {
                enqueue: encodedFrame => {
                    const data = new Uint8Array(encodedFrame.data);

                    expect(data.byteLength).toEqual(videoBytes.length);
                    expect(Array.from(data)).toEqual(videoBytes);
                    done();
                }
            };
            const sendController = {
                enqueue: encodedFrame => {
                    receiver.decodeFunction(encodedFrame, receiveController);
                }
            };
            const frame = {
                data: new Uint8Array(videoBytes).buffer,
                type: 'key'
            };

            await sender.encodeFunction(frame, sendController);
        });

        it('the receiver ratchets forward', async done => {
            await sender.setKey(key, 0);
            await receiver.setKey(key, 0);

            // Ratchet the key. We reimport from the raw bytes.
            const material = await importKey(key);

            await sender.setKey(await ratchet(material), 0);

            const receiveController = {
                enqueue: encodedFrame => {
                    const data = new Uint8Array(encodedFrame.data);

                    expect(data.byteLength).toEqual(audioBytes.length);
                    expect(Array.from(data)).toEqual(audioBytes);
                    done();
                }
            };
            const sendController = {
                enqueue: encodedFrame => {
                    receiver.decodeFunction(encodedFrame, receiveController);
                }
            };
            const frame = {
                data: new Uint8Array(audioBytes).buffer,
                type: undefined
            };

            await sender.encodeFunction(frame, sendController);
        });
    });
});
