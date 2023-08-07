import { ChatOpenAI } from "langchain/chat_models/openai";
import { AgentExecutor, initializeAgentExecutorWithOptions } from "langchain/agents";
import { Configuration } from "openai";
import { OpenAIApi } from "openai";
import { PineconeClient } from "@pinecone-database/pinecone";
import { PineconeStore } from "langchain/vectorstores/pinecone";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import {
  ConversationalRetrievalQAChain,
  
} from "langchain/chains";
import * as dotenv from "dotenv";
dotenv.config();

// PICK from ENV
const openAIApiKey = process.env.OPENAI_API_KEY;

const params = {
  verbose: true,
  temperature: 0,
  openAIApiKey,
  modelName: "gpt-3.5-turbo-16k",
  maxTokens: 1000,
};

const chatPrompt =
  "Your name is Liam Bohem. You are a tinnitus consultant. Use the following pieces of context to answer the question at the end. If you don't know the answer, just say apologise. DO NOT try to make up an answer.If the question is not related to the context, politely respond that this is beyond my scope of knowledge. Never mention the keyword `context` in the final answer\n\n{context}\n\nQuestion: {question}\nAi: ";

export class Model {
  public openai: OpenAIApi;
  public model: ChatOpenAI = new ChatOpenAI();
  public executor?: AgentExecutor;
  public pineconeClient: PineconeClient;
  public pineconeIndex: any;
  public vectorStore: any;
  public chain?: ConversationalRetrievalQAChain;
  public chat_history: string[] = [];
  public tokenCount: number = 0;
  public tokenThreshold: number = params.maxTokens * 0.8;
  generate: any;

  constructor() {
    const configuration = new Configuration({
      apiKey: openAIApiKey,
    });

    this.openai = new OpenAIApi(configuration);
    this.model = new ChatOpenAI(params, configuration);

    this.pineconeClient = new PineconeClient();
  }

  public async init() {
    await this.pineconeClient.init({
      apiKey: process.env.PINECONE_API_KEY as string,
      environment: "northamerica-northeast1-gcp",
    });
    this.vectorStore = await PineconeStore.fromExistingIndex(
      new OpenAIEmbeddings(),
      {
        pineconeIndex: this.pineconeClient.Index("tinnitus"),
        namespace: "",
      }
    );
    this.chain = ConversationalRetrievalQAChain.fromLLM(
      this.model,
      this.vectorStore.asRetriever(),
      {
        qaTemplate: chatPrompt,
        returnSourceDocuments: true,
      }
    );
  }

  public async call(input: string) {
    if (!this.chain) {
      this.chain = ConversationalRetrievalQAChain.fromLLM(
        this.model,
        this.vectorStore.asRetriever(),
        {
          qaTemplate: chatPrompt,
          returnSourceDocuments: true,
        }
      );
    }

    // Add input to chat history and update token count
    this.chat_history.push(input);
    this.tokenCount += input.split(" ").length;
    console.log(`Added input to chat history. Token count is now ${this.tokenCount}`);

    // Check if token count is close to or exceeds threshold value
    if (this.tokenCount >= this.tokenThreshold) {
      console.log(`Token count is close to or exceeds threshold value of ${this.tokenThreshold}. Removing older messages from chat history...`);
      while (this.tokenCount >= this.tokenThreshold && this.chat_history.length > 0) {
        const removedMessage = this.chat_history.shift();
        if (removedMessage) {
          this.tokenCount -= removedMessage.split(" ").length;
          console.log(`Removed message '${removedMessage}' from chat history. Token count is now ${this.tokenCount}`);
        }
      }
    }

    const response = await this.chain.call({ question: input, chat_history: this.chat_history });
    console.log("Model response: " + response.text);

    // Add response to chat history and update token count
    this.chat_history.push(response.text);
    this.tokenCount += response.text.split(" ").length;
    console.log(`Added response to chat history. Token count is now ${this.tokenCount}`);

    return response.text;
  }
}
