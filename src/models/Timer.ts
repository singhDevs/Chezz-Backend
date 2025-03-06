interface TimerCallbacks {
    onTimeUpdate: (timeLeft: number) => void;
    onTimeout: () => void;
}

export class Timer {
    private initialTime: number;
    timeLeft: number;
    private lastUpdate: number = Date.now();
    private intervalId: NodeJS.Timeout | null = null;
    private isRunning: boolean = false;
    private timeCallbacks: TimerCallbacks;

    constructor(initialTime: number, timerCallbacks: TimerCallbacks) {
        this.initialTime = initialTime;
        this.timeLeft = initialTime;
        this.timeCallbacks = timerCallbacks;
    }

    start() {
        this.isRunning = true;
        this.lastUpdate = Date.now();
        this.intervalId = setInterval(() => {
            this.update()
            console.log(this.timeLeft)
        }, 1000)
    }

    pause() {
        if (this.isRunning) {
            this.isRunning = false;
            if (this.intervalId) clearInterval(this.intervalId);

            this.update();
        }
    }

    update() {
        if (!this.isRunning) return;

        const currTime = Date.now();
        const elapsedTime = currTime - this.lastUpdate;
        this.timeLeft -= elapsedTime;
        this.lastUpdate = currTime;

        if (this.timeLeft <= 0) {
            //Timeout occured
            this.timeLeft = 0;
            this.pause();
            this.timeCallbacks.onTimeout();
        }

        this.timeCallbacks.onTimeUpdate(this.timeLeft);
    }

    reset(){
        this.pause();
        this.timeLeft = this.initialTime;
        this.timeCallbacks.onTimeUpdate(this.timeLeft);
    }
    clear(){
        if(this.intervalId) clearInterval(this.intervalId);
    }
}