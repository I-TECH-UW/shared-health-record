import { Kafka, Producer, Transaction } from 'kafkajs';
import { sendMessage, createTransaction } from '../lib/kafka';


// Mocking Kafka class constructor and methods
jest.mock('kafkajs', () => {
  const originalModule = jest.requireActual('kafkajs');
  return {
    ...originalModule,
    Kafka: jest.fn().mockImplementation(() => {
      return {
        producer: jest.fn().mockImplementation(() => {
          return {
            connect: jest.fn(),
            transaction: jest.fn().mockImplementation(() => {
              return {
                send: jest.fn(),
                commit: jest.fn(),
                abort: jest.fn(),
              };
            }),
            disconnect: jest.fn(),
          };
        }),
      };
    }),
  };
});

describe('sendMessage', () => {
  let mockProducer: Producer;
  let mockTransaction: Transaction;

  beforeEach(() => {
    // Create mock instances
    mockProducer = new (Kafka as any)().producer();
    mockTransaction = new (Kafka as any)().producer().transaction();
    // Reset mock call history
    jest.clearAllMocks();
  });

  it('should send and commit a message', async () => {
    const topic = 'test-topic';
    const message = { key: 'body', value: {} }

    await sendMessage(message, topic, mockProducer, mockTransaction);

    expect(mockProducer.disconnect).toHaveBeenCalledTimes(1);
    expect(mockTransaction.send).toHaveBeenCalledTimes(1);
    expect(mockTransaction.commit).toHaveBeenCalledTimes(1);
    expect(mockTransaction.abort).toHaveBeenCalledTimes(0);
  });

  it('should abort the transaction on error', async () => {
    mockTransaction.send.mockRejectedValueOnce(new Error('Send error'));

    await sendMessage("message", "topic", mockProducer, mockTransaction);

    expect(mockProducer.connect).toHaveBeenCalledTimes(1);
    expect(mockTransaction.send).toHaveBeenCalledTimes(1);
    expect(mockTransaction.commit).toHaveBeenCalledTimes(0);
    expect(mockTransaction.abort).toHaveBeenCalledTimes(1);
    expect(mockProducer.disconnect).toHaveBeenCalledTimes(1);
  });
});

describe('createTransaction', () => {
  let mockProducer: Producer;

  beforeEach(() => {
    // Create mock instance
    mockProducer = new (Kafka as any)().producer();
    // Reset mock call history
    jest.clearAllMocks();
  });

  it('should create a transaction', async () => {
    await createTransaction(mockProducer);

    expect(mockProducer.connect).toHaveBeenCalledTimes(1);
    expect(mockProducer.transaction).toHaveBeenCalledTimes(1);
    expect(mockProducer.disconnect).toHaveBeenCalledTimes(0);
  });

  it('should abort the transaction on error', async () => {
    mockProducer.transaction.mockRejectedValueOnce(new Error('Transaction error'));

    await createTransaction(mockProducer);

    expect(mockProducer.connect).toHaveBeenCalledTimes(1);
    expect(mockProducer.transaction).toHaveBeenCalledTimes(1);
    expect(mockProducer.disconnect).toHaveBeenCalledTimes(1);
  });
});
