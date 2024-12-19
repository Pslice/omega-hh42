// Old interface
class OldPrinter {
    printOldWay(text) {
        console.log(`[Old Printer]: ${text}`);
    }
}

// New interface that clients expect
class ModernPrinterInterface {
    print(text) {
        throw new Error('print method must be implemented');
    }
}

// Adapter to make OldPrinter work with new interface
class PrinterAdapter extends ModernPrinterInterface {
    constructor(oldPrinter) {
        super();
        this.oldPrinter = oldPrinter;
    }

    print(text) {
        // Adapt the old method to the new interface
        this.oldPrinter.printOldWay(text);
    }
}

// Usage example
const oldPrinter = new OldPrinter();
const printerAdapter = new PrinterAdapter(oldPrinter);

// Client code can now use the new interface
printerAdapter.print("Hello, Adapter Pattern!");


function printer(printerClass) {
    // Boolean check
    const hasPrintMethod = typeof printerClass.print === 'function';

    if (!hasPrintMethod) {
        return false;
    }

    return printerClass.print();
}