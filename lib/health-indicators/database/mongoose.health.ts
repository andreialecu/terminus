import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Connection } from 'mongoose';
import { HealthCheckError } from '@godaddy/terminus';

import * as NestJSMongoose from '@nestjs/mongoose';

import {
  promiseTimeout,
  TimeoutError as PromiseTimeoutError,
  checkPackages,
} from '../../utils';
import { HealthIndicatorResult, TimeoutError } from '../../';
import { HealthIndicator } from '../health-indicator';

export interface MongoosePingCheckSettings {
  /**
   * The connection which the ping check should get executed
   */
  connection?: Connection;
  /**
   * The amount of time the check should require in ms
   * @default 1000
   */
  timeout?: number;
}

/**
 * The MongooseHealthIndicator contains health indicators
 * which are used for health checks related to Mongoose
 */
@Injectable()
export class MongooseHealthIndicator extends HealthIndicator {
  /**
   * Initializes the MongooseHealthIndicator
   *
   * @param {ModuleRef} moduleRef The NestJS module reference
   *
   * @public
   */
  constructor(private moduleRef: ModuleRef) {
    super();
  }

  /**
   * Checks if the dependant packages are present
   */
  private checkDependantPackages() {
    checkPackages(['@nestjs/mongoose', 'mongoose'], this.constructor.name);
  }

  /**
   * Returns the connection of the current DI context
   */
  private getContextConnection(): Connection {
    const {
      getConnectionToken,
    } = require('@nestjs/mongoose/dist/common/mongoose.utils') as typeof NestJSMongoose;

    return this.moduleRef.get(getConnectionToken(null));
  }

  /**
   * Pings a mongoose connection
   * @param connection The connection which the ping should get executed
   * @param timeout The timeout how long the ping should maximum take
   *
   */
  private async pingDb(connection: Connection, timeout: number) {
    return await promiseTimeout(timeout, connection.startSession());
  }

  /**
   * Checks if the MongoDB responds in (default) 1000ms and
   * returns a result object corresponding to the result
   *
   * @param key The key which will be used for the result object
   * @param options The options for the ping
   * @example
   * mongooseHealthIndicator.pingCheck('mongodb', { timeout: 1500 });
   */
  public async pingCheck(
    key: string,
    options: MongoosePingCheckSettings = {},
  ): Promise<HealthIndicatorResult> {
    let isHealthy = false;
    this.checkDependantPackages();

    const connection = options.connection || this.getContextConnection();
    const timeout = options.timeout || 1000;

    try {
      await this.pingDb(connection, timeout);
      isHealthy = true;
    } catch (err) {
      if (err instanceof PromiseTimeoutError) {
        throw new TimeoutError(
          timeout,
          this.getStatus(key, isHealthy, {
            message: `timeout of ${timeout}ms exceeded`,
          }),
        );
      }
    }

    if (isHealthy) {
      return this.getStatus(key, isHealthy);
    } else {
      throw new HealthCheckError(
        `${key} is not available`,
        this.getStatus(key, isHealthy),
      );
    }
  }
}
